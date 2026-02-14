// Guard against duplicate loading (MAIN world scripts can run multiple times)
if (window.nameResolutionService) {
  // Already initialized, skip
} else {

/**
 * Proper keccak256 implementation (from decode.js)
 * Used for computing ENS reverse nodes
 */
function keccak256Simple(message) {
  // Try to use ethers if available
  if (typeof window !== 'undefined') {
    if (window.ethers?.keccak256 && window.ethers?.toUtf8Bytes) {
      try { return window.ethers.keccak256(window.ethers.toUtf8Bytes(message)); } catch {}
    }
    if (window.ethers?.utils?.keccak256 && window.ethers?.utils?.toUtf8Bytes) {
      try { return window.ethers.utils.keccak256(window.ethers.utils.toUtf8Bytes(message)); } catch {}
    }
  }

  // Minimal keccak256 implementation
  const KECCAK_ROUNDS = 24;
  const KECCAK_RC = [
    0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
    0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
    0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
    0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
    0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
    0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n
  ];
  const KECCAK_ROTC = [1,3,6,10,15,21,28,36,45,55,2,14,27,41,56,8,25,43,62,18,39,61,20,44];
  const KECCAK_PILN = [10,7,11,17,18,3,5,16,8,21,24,4,15,23,19,13,12,2,20,14,22,9,6,1];

  function rotl64(x, y) { return ((x << BigInt(y)) | (x >> BigInt(64 - y))) & 0xffffffffffffffffn; }

  function keccakF(state) {
    for (let round = 0; round < KECCAK_ROUNDS; round++) {
      const c = new Array(5).fill(0n);
      for (let x = 0; x < 5; x++) c[x] = state[x] ^ state[x+5] ^ state[x+10] ^ state[x+15] ^ state[x+20];
      for (let x = 0; x < 5; x++) {
        const t = c[(x+4)%5] ^ rotl64(c[(x+1)%5], 1);
        for (let y = 0; y < 25; y += 5) state[x+y] ^= t;
      }
      let t = state[1];
      for (let i = 0; i < 24; i++) {
        const j = KECCAK_PILN[i];
        const tmp = state[j];
        state[j] = rotl64(t, KECCAK_ROTC[i]);
        t = tmp;
      }
      for (let y = 0; y < 25; y += 5) {
        const t0 = state[y], t1 = state[y+1], t2 = state[y+2], t3 = state[y+3], t4 = state[y+4];
        state[y] = t0 ^ (~t1 & t2); state[y+1] = t1 ^ (~t2 & t3);
        state[y+2] = t2 ^ (~t3 & t4); state[y+3] = t3 ^ (~t4 & t0); state[y+4] = t4 ^ (~t0 & t1);
      }
      state[0] ^= KECCAK_RC[round];
    }
  }

  const encoder = new TextEncoder();
  const input = encoder.encode(message);
  const rate = 136, capacity = 64;
  const blockSize = rate;
  const state = new Array(25).fill(0n);

  const padded = new Uint8Array(Math.ceil((input.length + 1) / blockSize) * blockSize);
  padded.set(input);
  padded[input.length] = 0x01;
  padded[padded.length - 1] |= 0x80;

  for (let i = 0; i < padded.length; i += blockSize) {
    for (let j = 0; j < blockSize && j < 200; j += 8) {
      if (i + j + 8 <= padded.length) {
        let val = 0n;
        for (let k = 0; k < 8; k++) val |= BigInt(padded[i + j + k]) << BigInt(k * 8);
        state[Math.floor(j / 8)] ^= val;
      }
    }
    keccakF(state);
  }

  let hash = '0x';
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 8; j++) {
      hash += ((state[i] >> BigInt(j * 8)) & 0xffn).toString(16).padStart(2, '0');
    }
  }
  return hash;
}

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
    } catch (error) {
      // Silently fail - config loading errors are not critical
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

      // Log successful resolution
      if (name) {
        console.log(`[NameResolution] Resolved ${address} -> ${name} on chain ${chainId}`);
      }

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
          console.warn(`[NameResolution] Provider ${provider} failed:`, providerError.message);
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
          console.warn('[NameResolution] Alchemy API failed:', alchemyError.message);
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
   * Uses proper keccak256 implementation
   */
  _keccak256(data) {
    try {
      // Use the proper keccak256 implementation
      // It will try ethers.js first if available, then fall back to built-in keccak
      return keccak256Simple(data);
    } catch (error) {
      console.error('[NameResolution] keccak256 failed:', error);
      // Return zero hash as last resort
      return '0x' + '0'.repeat(64);
    }
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

} // End of duplicate-load guard
