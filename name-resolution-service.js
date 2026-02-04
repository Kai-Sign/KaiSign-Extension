/**
 * Name Resolution Service
 * Resolves addresses to human-readable names (ENS, Basenames, etc.)
 *
 * Priority: Uses free public RPC first, falls back to Alchemy API if provided
 */
class NameResolutionService {
  constructor() {
    this.cache = new Map(); // address-chainId -> { name, timestamp }
    this.cacheTTL = 3600000; // 1 hour cache for names
    this.pendingRequests = new Map(); // Deduplication
    this.enabled = true;
    this.alchemyApiKey = ''; // Optional, uses free public RPC by default

    // Load API key from storage
    this._loadConfig();
  }

  /**
   * Load configuration from chrome.storage
   */
  async _loadConfig() {
    try {
      const result = await chrome.storage.local.get(['alchemyApiKey', 'enableNameResolution']);
      this.alchemyApiKey = result.alchemyApiKey || '';
      this.enabled = result.enableNameResolution !== false;
      console.log('[NameResolution] Config loaded:', { hasAlchemyKey: !!this.alchemyApiKey, enabled: this.enabled });
    } catch (error) {
      console.warn('[NameResolution] Failed to load config:', error);
    }
  }

  /**
   * Resolve address to name based on chain
   * @param {string} address - Ethereum address
   * @param {number} chainId - Chain ID (1 = mainnet, 8453 = Base)
   * @returns {Promise<string|null>} - Resolved name or null
   */
  async resolveName(address, chainId) {
    if (!this.enabled || !address || !address.startsWith('0x')) return null;

    const normalizedAddress = address.toLowerCase();
    const cacheKey = `${normalizedAddress}-${chainId}`;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.name;
    }

    // Deduplicate concurrent requests for same address
    if (this.pendingRequests.has(cacheKey)) {
      return await this.pendingRequests.get(cacheKey);
    }

    const promise = this._resolveNameByChain(normalizedAddress, chainId);
    this.pendingRequests.set(cacheKey, promise);

    try {
      const name = await promise;

      // Cache result (even null to avoid repeated failed lookups)
      this.cache.set(cacheKey, {
        name: name,
        timestamp: Date.now()
      });

      return name;
    } finally {
      this.pendingRequests.delete(cacheKey);
    }
  }

  /**
   * Internal: Resolve name based on chain type
   */
  async _resolveNameByChain(address, chainId) {
    switch (chainId) {
      case 1: // Ethereum mainnet - ENS
        return await this._resolveENS(address);

      case 8453: // Base - Basenames
        return await this._resolveBasename(address);

      default:
        // Other chains: no name resolution yet
        return null;
    }
  }

  /**
   * Resolve ENS name on Ethereum mainnet
   * Priority: Public RPC first (free), then fallback to APIs if keys provided
   */
  async _resolveENS(address) {
    try {
      // PRIMARY METHOD: Direct ENS contract call via public RPC (FREE, NO KEY)
      const reverseNode = this._computeReverseNode(address);
      const publicRpcProviders = [
        'https://eth.llamarpc.com',
        'https://rpc.ankr.com/eth',
        'https://ethereum.publicnode.com'
      ];

      // Try public RPC providers
      for (const provider of publicRpcProviders) {
        try {
          const rpcResponse = await fetch(provider, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'eth_call',
              params: [{
                to: '0x084b1c3C81545d370f3634392De611CaaBFf8148', // ENS Reverse Registrar
                data: `0x691f3431${reverseNode.slice(2)}` // name(bytes32 node)
              }, 'latest']
            })
          });

          const rpcData = await rpcResponse.json();
          if (rpcData.result && rpcData.result !== '0x' && rpcData.result.length > 2) {
            const ensName = this._decodeENSName(rpcData.result);
            if (ensName && ensName.endsWith('.eth')) {
              console.log('[NameResolution] ENS resolved via', provider, ':', ensName);
              return ensName;
            }
          }
        } catch (providerError) {
          console.debug(`[NameResolution] Provider ${provider} failed:`, providerError.message);
          // Try next provider
          continue;
        }
      }

      // FALLBACK: Alchemy ENS API (only if API key provided)
      if (this.alchemyApiKey) {
        try {
          const alchemyUrl = `https://eth-mainnet.g.alchemy.com/v2/${this.alchemyApiKey}`;
          const alchemyResponse = await fetch(alchemyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'alchemy_resolveAddress',
              params: [address]
            })
          });

          const alchemyData = await alchemyResponse.json();
          if (alchemyData.result && alchemyData.result.name) {
            console.log('[NameResolution] ENS resolved via Alchemy:', alchemyData.result.name);
            return alchemyData.result.name;
          }
        } catch (alchemyError) {
          console.debug('[NameResolution] Alchemy API failed:', alchemyError.message);
        }
      }

      // No ENS name found
      return null;
    } catch (error) {
      console.warn('[NameResolution] ENS lookup failed:', error.message);
      return null;
    }
  }

  /**
   * Resolve Basename on Base chain
   */
  async _resolveBasename(address) {
    try {
      // Basenames use ENS-compatible L2 Resolver
      // Base Name Resolver: 0xC6d566A56A1aFf6508b41f6c90ff131615583BCD
      const reverseNode = this._computeReverseNode(address);
      const baseRpcProviders = [
        'https://mainnet.base.org',
        'https://base.llamarpc.com'
      ];

      for (const provider of baseRpcProviders) {
        try {
          const rpcResponse = await fetch(provider, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'eth_call',
              params: [{
                to: '0xC6d566A56A1aFf6508b41f6c90ff131615583BCD', // Base Name Resolver
                data: `0x691f3431${reverseNode.slice(2)}` // name(bytes32 node)
              }, 'latest']
            })
          });

          const rpcData = await rpcResponse.json();
          if (rpcData.result && rpcData.result !== '0x' && rpcData.result.length > 2) {
            const basename = this._decodeENSName(rpcData.result);
            if (basename && basename.endsWith('.base.eth')) {
              console.log('[NameResolution] Basename resolved:', basename);
              return basename;
            }
          }
        } catch (providerError) {
          console.debug(`[NameResolution] Base provider ${provider} failed:`, providerError.message);
          continue;
        }
      }

      return null;
    } catch (error) {
      console.warn('[NameResolution] Basename lookup failed:', error.message);
      return null;
    }
  }

  /**
   * Compute ENS reverse node for address using namehash
   * Reverse node format: namehash(addr.lowercase.addr.reverse)
   */
  _computeReverseNode(address) {
    // Remove 0x prefix and convert to lowercase
    const addr = address.toLowerCase().slice(2);
    const reverseLabel = `${addr}.addr.reverse`;

    // Compute namehash
    return this._namehash(reverseLabel);
  }

  /**
   * Compute ENS namehash (EIP-137)
   * @param {string} name - Domain name (e.g., "vitalik.eth")
   * @returns {string} - 32-byte hash as hex string
   */
  _namehash(name) {
    let node = '0x0000000000000000000000000000000000000000000000000000000000000000';

    if (name) {
      const labels = name.split('.');
      for (let i = labels.length - 1; i >= 0; i--) {
        const labelHash = this._keccak256(labels[i]);
        node = this._keccak256(node + labelHash.slice(2));
      }
    }

    return node;
  }

  /**
   * Keccak256 hash function
   * Uses ethers.js if available, otherwise falls back to simple implementation
   */
  _keccak256(data) {
    // Try ethers.js first
    if (typeof ethers !== 'undefined' && ethers.utils && ethers.utils.keccak256) {
      if (typeof data === 'string' && !data.startsWith('0x')) {
        // Convert string to bytes
        return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(data));
      }
      return ethers.utils.keccak256(data);
    }

    // Fallback: Simple keccak256 (NOT RECOMMENDED FOR PRODUCTION)
    console.warn('[NameResolution] ethers.js not available, using fallback hash');
    // This is a placeholder - proper implementation needs js-sha3 or similar
    return '0x' + this._simpleHash(data);
  }

  /**
   * Simple hash fallback (NOT CRYPTOGRAPHICALLY SECURE)
   * Only used if ethers.js is unavailable
   */
  _simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).padStart(64, '0');
  }

  /**
   * Decode ENS name from ABI-encoded response
   */
  _decodeENSName(hexResult) {
    try {
      // Remove 0x prefix
      const hex = hexResult.slice(2);

      // ABI encoding: offset (32 bytes) + length (32 bytes) + data
      const offset = parseInt(hex.slice(0, 64), 16) * 2;
      const length = parseInt(hex.slice(offset, offset + 64), 16) * 2;
      const nameHex = hex.slice(offset + 64, offset + 64 + length);

      // Convert hex to UTF-8 string
      let name = '';
      for (let i = 0; i < nameHex.length; i += 2) {
        const byte = parseInt(nameHex.substr(i, 2), 16);
        if (byte === 0) break; // Stop at null terminator
        name += String.fromCharCode(byte);
      }

      return name || null;
    } catch (error) {
      console.error('[NameResolution] Failed to decode ENS name:', error);
      return null;
    }
  }

  /**
   * Clear cache (for testing or manual refresh)
   */
  clearCache() {
    this.cache.clear();
    console.log('[NameResolution] Cache cleared');
  }

  /**
   * Update configuration
   */
  updateConfig(config) {
    if (config.hasOwnProperty('alchemyApiKey')) {
      this.alchemyApiKey = config.alchemyApiKey;
    }
    if (config.hasOwnProperty('enabled')) {
      this.enabled = config.enabled;
    }
    console.log('[NameResolution] Config updated:', { hasAlchemyKey: !!this.alchemyApiKey, enabled: this.enabled });
  }
}

// Initialize global instance
if (typeof window !== 'undefined') {
  window.nameResolutionService = new NameResolutionService();
  console.log('[NameResolution] Service initialized');
}
