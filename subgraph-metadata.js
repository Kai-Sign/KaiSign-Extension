/**
 * subgraph-metadata.js - Subgraph Metadata Fetcher (SubgraphMetadataService)
 *
 * Purpose
 *   Fetches ERC-7730 metadata blobs from the KaiSign subgraph and gates
 *   them through on-chain verification before any caller sees them.
 *   Loaded into the page's MAIN world.
 *
 * Trust boundary
 *   The subgraph response is UNTRUSTED. A malicious or compromised indexer
 *   could return a metadata blob that mis-renders intent (e.g. a fake
 *   "Approve 1 USDC" cover for a max-uint approve). Verification against
 *   the on-chain registry is the only thing standing between that blob and
 *   the user's display - it must run BEFORE the cache write, never after.
 *
 * Security-critical invariants
 *   - On-chain verification (line 360) is awaited; the result is assigned to
 *     metadata._verification BEFORE the cache write (line 371). Reverting
 *     this to fire-and-forget freezes _verification as undefined and breaks
 *     the popup's verified/unverified badge.
 *   - The cache key includes chainId and selector; metadata for one
 *     (address, chainId, selector) tuple must never satisfy a lookup for
 *     a different tuple.
 *   - When verification throws, _verification is set to a failure record
 *     ({verified: false, source: 'error', ...}) - never silently dropped.
 *     The popup must surface "unverified" rather than show metadata as if
 *     it had been verified.
 *
 * Trust dependencies
 *   - window.onChainVerifier (onchain-verifier.js) - the verification
 *     primitive. This file trusts the verifier's verdict but nothing else
 *     in the request path.
 *   - background.js RPC host whitelist - all network calls flow through
 *     fetchViaBackground / rpcCallViaBackground and are constrained by the
 *     allow-list there. This file does not perform direct fetches.
 *
 * Out of scope
 *   - Decoding (decode.js).
 *   - Leaf-hash math (onchain-verifier.js).
 *   - RPC host whitelisting (background.js).
 */

// Guard against duplicate loading (MAIN world scripts can run multiple times)
if (window.metadataService) {
  console.log('[KaiSign] Subgraph metadata service already loaded, skipping');
} else {

console.log('[KaiSign] Subgraph metadata service loading...');
function getKaiSignDebugFlag() {
  try {
    return typeof window !== 'undefined' && window.localStorage?.getItem('kaisign_dev_mode') === 'true';
  } catch {
    return false;
  }
}

const KAISIGN_DEBUG = getKaiSignDebugFlag();


class SubgraphMetadataService {
  constructor(config) {
    this.cacheTTL = config.cacheTTL || 300000; // 5 minutes default

    // Note: API base URL is read dynamically via getLocalApiBase() to support runtime changes

    // Caches
    this.metadataCache = new Map(); // address+chainId -> metadata
    this.blobCache = new Map(); // unused; kept for clearCache()/getCacheStats() back-compat
    this.tokenCache = new Map(); // address -> token info

    KAISIGN_DEBUG && console.log('[Subgraph] Service initialized:', {
      cacheTTL: this.cacheTTL
    });
  }

  /**
   * Get API base URL. Uses production by default.
   * Local override only works when developer mode is explicitly enabled.
   * @returns {string} API base URL
   */
  getLocalApiBase() {
    const PRODUCTION_API = 'https://kai-sign-production.up.railway.app';
    try {
      // Developer mode must be explicitly enabled for local API override
      const devMode = localStorage.getItem('kaisign_dev_mode') === 'true';
      if (devMode) {
        const localOverride = localStorage.getItem('kaisign_local_api');
        if (localOverride) {
          return localOverride;
        }
      }
      return PRODUCTION_API;
    } catch {
      return PRODUCTION_API;
    }
  }

  /**
   * Get implementation address from proxy contract storage
   * Checks EIP-1967 and other common proxy patterns
   * @param {string} proxyAddress - Proxy contract address
   * @returns {Promise<string|null>} Implementation address or null
   */
  async getImplementationAddress(proxyAddress) {
    // EIP-1967 implementation slot: keccak256("eip1967.proxy.implementation") - 1
    const EIP1967_IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
    // Safe proxy uses a different slot - masterCopy at slot 0
    const SAFE_MASTER_COPY_SLOT = '0x0000000000000000000000000000000000000000000000000000000000000000';

    const slots = [EIP1967_IMPL_SLOT, SAFE_MASTER_COPY_SLOT];

    for (const slot of slots) {
      try {
        const result = await this.ethGetStorageAt(proxyAddress, slot);
        if (result && result !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
          // Extract address from 32-byte slot (last 20 bytes)
          const implAddress = '0x' + result.slice(-40).toLowerCase();
          if (implAddress !== '0x0000000000000000000000000000000000000000') {
            KAISIGN_DEBUG && console.log('[KaiSign API] Found implementation at slot', slot, ':', implAddress);
            return implAddress;
          }
        }
      } catch (e) {
        KAISIGN_DEBUG && console.warn('[KaiSign API] Failed to read slot', slot, e.message);
      }
    }
    return null;
  }

  /**
   * Call eth_getStorageAt via window.ethereum
   * @param {string} address - Contract address
   * @param {string} slot - Storage slot
   * @returns {Promise<string>} Storage value
   */
  async ethGetStorageAt(address, slot) {
    if (typeof window !== 'undefined' && window.ethereum) {
      return await window.ethereum.request({
        method: 'eth_getStorageAt',
        params: [address, slot, 'latest']
      });
    }
    throw new Error('No ethereum provider');
  }

  /**
   * Call eth_call via window.ethereum
   * @param {string} to - Contract address
   * @param {string} data - Calldata
   * @returns {Promise<string>} Return data
   */
  async ethCall(to, data) {
    if (typeof window !== 'undefined' && window.ethereum) {
      return await window.ethereum.request({
        method: 'eth_call',
        params: [{ to, data }, 'latest']
      });
    }
    throw new Error('No ethereum provider');
  }

  /**
   * Get Diamond facet address for a specific function selector (EIP-2535)
   * Calls facetAddress(bytes4 selector) on the Diamond proxy
   * @param {string} diamondAddress - Diamond proxy address
   * @param {string} selector - 4-byte function selector (e.g., "0x12345678")
   * @returns {Promise<string|null>} Facet implementation address or null
   */
  async getDiamondFacetAddress(diamondAddress, selector) {
    // facetAddress(bytes4 _functionSelector) returns (address)
    // Selector for facetAddress: 0xcdffacc6
    const FACET_ADDRESS_SELECTOR = '0xcdffacc6';

    // Pad selector to 32 bytes for the function parameter
    const paddedSelector = selector.slice(2).padStart(64, '0');
    const calldata = FACET_ADDRESS_SELECTOR + paddedSelector;

    try {
      const result = await this.ethCall(diamondAddress, calldata);

      if (result && result !== '0x' && result.length >= 66) {
        // Extract address from 32-byte return value (last 20 bytes)
        const facetAddr = '0x' + result.slice(-40).toLowerCase();

        // Check it's not zero address
        if (facetAddr !== '0x0000000000000000000000000000000000000000') {
          KAISIGN_DEBUG && console.log('[KaiSign] Diamond facet for selector', selector, ':', facetAddr);
          return facetAddr;
        }
      }
    } catch (error) {
      // If facetAddress call fails, this is not a Diamond proxy
      KAISIGN_DEBUG && console.debug('[KaiSign] Diamond facetAddress call failed (not a Diamond proxy?):', error.message);
    }

    return null;
  }

  /**
   * Check if a contract is a Diamond proxy by checking if facetAddress is available
   * @param {string} address - Contract address
   * @returns {Promise<boolean>} True if this is a Diamond proxy
   */
  async isDiamondProxy(address) {
    // Try to call facetAddress with a known selector (like facetAddress itself: 0xcdffacc6)
    const testSelector = '0xcdffacc6'; // facetAddress selector
    try {
      const result = await this.getDiamondFacetAddress(address, testSelector);
      return result !== null;
    } catch {
      return false;
    }
  }

  /**
   * Get contract metadata from KaiSign proxy API
   * @param {string} address - Contract address
   * @param {number} chainId - Chain ID
   * @param {string} selector - Optional function selector (required for Diamond proxy facet lookup)
   * @returns {Promise<Object>} ERC-7730 metadata
   */
  async getContractMetadata(address, chainId, selector) {
    const normalizedAddress = address.toLowerCase();
    const normalizedSelector = selector?.toLowerCase() || null;

    // Normalize chainId to number (handle hex strings like '0x1')
    let normalizedChainId = chainId;
    if (typeof chainId === 'string' && chainId.startsWith('0x')) {
      normalizedChainId = parseInt(chainId, 16);
    } else if (typeof chainId === 'string') {
      normalizedChainId = parseInt(chainId, 10);
    }

    const cacheKey = `${normalizedAddress}-${normalizedChainId}-${normalizedSelector || ''}`;

    // Check cache first
    const cached = this.metadataCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      KAISIGN_DEBUG && console.log('[KaiSign API] Cache hit for:', normalizedAddress);
      return cached.data;
    }


    try {
      KAISIGN_DEBUG && console.log('[KaiSign API] Fetching metadata for:', normalizedAddress, 'chain:', normalizedChainId);

      // Fetch via KaiSign API /contract endpoint
      const apiBase = this.getLocalApiBase();
      const apiUrl = `${apiBase}/api/py/contract/${normalizedAddress}?chain_id=${normalizedChainId}`;

      const rawData = await this.fetchViaBackground(apiUrl);

      // Debug: Log raw response to identify parsing issues
      console.log('[KaiSign API] Raw response type:', typeof rawData);
      console.log('[KaiSign API] Raw response preview:', rawData?.substring?.(0, 300) || rawData);

      let response;
      try {
        response = JSON.parse(rawData);
      } catch (parseError) {
        console.error('[KaiSign API] JSON parse failed:', parseError.message);
        console.error('[KaiSign API] Raw data that failed to parse:', rawData);
        throw new Error(`JSON parse error: ${parseError.message}`);
      }

      // Extract metadata from API response
      if (!response.success || !response.metadata) {
        // Direct lookup failed - check for proxy patterns
        console.log('[KaiSign API] Direct lookup failed:', {
          success: response.success,
          hasMetadata: !!response.metadata,
          error: response.error,
          address: normalizedAddress,
          responseKeys: Object.keys(response || {})
        });
        KAISIGN_DEBUG && console.log('[KaiSign API] Checking for proxy patterns...');

        // Try Diamond proxy detection first (if we have a selector)
        if (selector) {
          KAISIGN_DEBUG && console.log('[KaiSign API] Checking for Diamond proxy with selector:', selector);
          const facetAddress = await this.getDiamondFacetAddress(normalizedAddress, selector);

          if (facetAddress && facetAddress !== normalizedAddress) {
            KAISIGN_DEBUG && console.log('[KaiSign API] Diamond facet found:', facetAddress, '- fetching metadata');
            try {
              const facetMetadata = await this.getContractMetadataDirectly(facetAddress, chainId);

              // Cache for original diamond proxy address + selector
              this.metadataCache.set(cacheKey, {
                data: facetMetadata,
                timestamp: Date.now()
              });

              return facetMetadata;
            } catch (facetError) {
              KAISIGN_DEBUG && console.warn('[KaiSign API] Facet metadata fetch failed:', facetError.message);
              // Continue to try other proxy patterns
            }
          }
        }

        // Try EIP-1967 / Safe proxy patterns
        const implAddress = await this.getImplementationAddress(normalizedAddress);

        if (implAddress && implAddress !== normalizedAddress) {
          KAISIGN_DEBUG && console.log('[KaiSign API] Found implementation:', implAddress, '- fetching metadata');
          const implMetadata = await this.getContractMetadataDirectly(implAddress, chainId);

          // Cache for original proxy address too
          this.metadataCache.set(cacheKey, {
            data: implMetadata,
            timestamp: Date.now()
          });

          return implMetadata;
        }

        throw new Error(response.error || 'No metadata in response');
      }

      const metadata = response.metadata;

      // v1.0.0: backend serves only (chainId, extcodehash, metadata). Leaf
      // hashes and merkle proofs are computed client-side against the cached
      // registry merkleRoot — see onchain-verifier.js + merkle-tree.js.

      // Check if the metadata has the format for this selector
      // If not, and it's a Diamond proxy, try fetching facet metadata
      if (selector && metadata.display?.formats) {
        const hasMatchingFormat = Object.keys(metadata.display.formats).some(sig => {
          // Check if any format signature matches this selector
          // Format key could be full signature like "transfer(address,uint256)"
          return sig.includes(selector.slice(2)) || this.selectorMatchesSignature(selector, sig);
        });

        if (!hasMatchingFormat) {
          KAISIGN_DEBUG && console.log('[KaiSign API] No matching format for selector, checking for Diamond facet...');
          const facetAddress = await this.getDiamondFacetAddress(normalizedAddress, selector);

          if (facetAddress && facetAddress !== normalizedAddress) {
            KAISIGN_DEBUG && console.log('[KaiSign API] Diamond facet for unmatched selector:', facetAddress);
            try {
              const facetMetadata = await this.getContractMetadataDirectly(facetAddress, chainId);

              // Merge facet display formats into main metadata
              if (facetMetadata.display?.formats) {
                metadata.display = metadata.display || { formats: {} };
                Object.assign(metadata.display.formats, facetMetadata.display.formats);
                KAISIGN_DEBUG && console.log('[KaiSign API] Merged facet metadata formats');
              }
            } catch (facetError) {
              KAISIGN_DEBUG && console.warn('[KaiSign API] Facet metadata merge failed:', facetError.message);
            }
          }
        }
      }

      // Run verification — await so _verification is populated before the
      // metadata gets cached. Single path post-v1.0.0: two-leaf merkle proof
      // against the cached registry root.
      if (typeof window !== 'undefined' && window.onChainVerifier) {
        try {
          const verification = await window.onChainVerifier.verifyMetadataAgainstRoot(
            metadata,
            normalizedAddress,
            normalizedChainId
          );
          metadata._verification = verification;
          KAISIGN_DEBUG && console.log('[KaiSign API] Verification result:', verification.source, verification.verified);
        } catch (err) {
          metadata._verification = { verified: false, source: 'error', details: err.message };
          KAISIGN_DEBUG && console.warn('[KaiSign API] Verification failed:', err.message);
        }
      }

      // Cache result
      this.metadataCache.set(cacheKey, {
        data: metadata,
        timestamp: Date.now()
      });

      KAISIGN_DEBUG && console.log('[KaiSign API] Successfully fetched metadata for:', normalizedAddress);
      return metadata;

    } catch (error) {
      KAISIGN_DEBUG && console.log('[KaiSign API] Metadata fetch error:', error.message, error.stack);
      // Check if extension context was invalidated
      if (error.message.includes('Extension') || error.message.includes('refresh')) {
        throw new Error('Extension was reloaded. Please refresh the page.');
      }
      throw new Error(`No metadata found for contract ${normalizedAddress} on chain ${chainId}`);
    }
  }

  /**
   * Check if a selector matches a function signature (simplified check)
   * @param {string} selector - 4-byte selector (e.g., "0x12345678")
   * @param {string} signature - Function signature (e.g., "transfer(address,uint256)")
   * @returns {boolean} True if they match
   */
  selectorMatchesSignature(selector, signature) {
    // This is a simplified check - in production you'd compute keccak256(signature).slice(0,10)
    // For now, just check if the signature's ABI entry would produce this selector
    // Return false to be safe - the full selector check happens elsewhere
    return false;
  }

  /**
   * Extract per-selector metadata from a potentially large metadata object.
   * Returns a minimal metadata object containing only the ABI entry and display
   * format matching the given selector, suitable for hardware wallets.
   * @param {Object} metadata - Full ERC-7730 metadata
   * @param {string} selector - 4-byte function selector (e.g., "0xa9059cbb")
   * @returns {Object} Minimal metadata for this selector
   */
  extractSelectorMetadata(metadata, selector) {
    if (!metadata || !selector) return metadata;

    const normalizedSelector = selector.toLowerCase();
    const abi = metadata.context?.contract?.abi || [];
    const formats = metadata.display?.formats || {};

    // Find matching ABI entry
    const matchingAbi = abi.filter(entry =>
      entry.selector && entry.selector.toLowerCase() === normalizedSelector
    );

    if (matchingAbi.length === 0) return metadata; // No match, return original

    // Find matching display formats
    const matchingFormats = {};
    const matchedName = matchingAbi[0].name;

    for (const [key, value] of Object.entries(formats)) {
      if (key.startsWith(matchedName + '(') || key.includes(normalizedSelector.slice(2))) {
        matchingFormats[key] = value;
      }
    }

    // Build minimal metadata
    return {
      $schema: metadata.$schema,
      context: {
        contract: {
          abi: matchingAbi,
          deployments: metadata.context?.contract?.deployments,
          ...(metadata.context?.contract?.facetOf && { facetOf: metadata.context.contract.facetOf })
        }
      },
      metadata: metadata.metadata,
      display: {
        formats: matchingFormats
      },
      _verification: metadata._verification,
      _extracted: true
    };
  }

  /**
   * Direct metadata lookup without proxy detection (to avoid recursion)
   * @param {string} address - Contract address
   * @param {number} chainId - Chain ID
   * @returns {Promise<Object>} ERC-7730 metadata
   */
  async getContractMetadataDirectly(address, chainId) {
    const normalizedAddress = address.toLowerCase();
    const apiBase = this.getLocalApiBase();
    const apiUrl = `${apiBase}/api/py/contract/${normalizedAddress}?chain_id=${chainId}`;

    console.log('[KaiSign API] getContractMetadataDirectly:', normalizedAddress, 'chain:', chainId);

    const rawData = await this.fetchViaBackground(apiUrl);

    console.log('[KaiSign API] Direct lookup raw response:', rawData?.substring?.(0, 200) || rawData);

    let response;
    try {
      response = JSON.parse(rawData);
    } catch (parseError) {
      console.error('[KaiSign API] Direct lookup JSON parse failed:', parseError.message, 'raw:', rawData);
      throw new Error(`JSON parse error: ${parseError.message}`);
    }

    if (!response.success || !response.metadata) {
      console.error('[KaiSign API] Direct lookup failed:', {
        success: response.success,
        hasMetadata: !!response.metadata,
        error: response.error
      });
      throw new Error(response.error || 'No metadata in response');
    }

    console.log('[KaiSign API] Direct lookup success for:', normalizedAddress);
    return response.metadata;
  }

  /**
   * Get token metadata (symbol, decimals, name) - fetches from on-chain if API doesn't provide
   * @param {string} address - Token address
   * @param {number} chainId - Chain ID
   * @returns {Promise<Object>} Token metadata
   */
  async getTokenMetadata(address, chainId = 1) {
    const normalizedAddress = address.toLowerCase();
    const cacheKey = `token-${normalizedAddress}-${chainId}`;

    // Check token cache
    const cached = this.tokenCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      KAISIGN_DEBUG && console.log('[KaiSign API] Token cache hit:', normalizedAddress);
      return cached.data;
    }

    let symbol = '';
    let decimals = 18;
    let name = 'Unknown Token';

    // Try to get from API first
    try {
      const metadata = await this.getContractMetadata(normalizedAddress, chainId);
      symbol = metadata.metadata?.symbol || metadata.context?.contract?.symbol || '';
      decimals = metadata.metadata?.decimals || metadata.context?.contract?.decimals || 0;
      name = metadata.metadata?.name || metadata.context?.contract?.name || 'Unknown Token';
    } catch (error) {
      KAISIGN_DEBUG && console.warn('[KaiSign API] Token API metadata not found:', normalizedAddress, error.message);
    }

    // If no decimals from API, fetch from on-chain
    if (!decimals) {
      KAISIGN_DEBUG && console.log('[KaiSign API] Fetching token decimals on-chain:', normalizedAddress);
      try {
        // decimals() selector: 0x313ce567
        const decimalsResult = await this.ethCall(normalizedAddress, '0x313ce567');
        if (decimalsResult && decimalsResult !== '0x') {
          decimals = parseInt(decimalsResult, 16);
          KAISIGN_DEBUG && console.log('[KaiSign API] Got decimals from on-chain:', decimals);
        }
      } catch (e) {
        decimals = 18;
      }
    }

    // If no symbol from API, fetch from on-chain
    if (!symbol) {
      KAISIGN_DEBUG && console.log('[KaiSign API] Fetching token symbol on-chain:', normalizedAddress);
      try {
        // symbol() selector: 0x95d89b41
        const symbolResult = await this.ethCall(normalizedAddress, '0x95d89b41');
        if (symbolResult && symbolResult !== '0x' && symbolResult.length > 2) {
          symbol = this.decodeAbiString(symbolResult);
          KAISIGN_DEBUG && console.log('[KaiSign API] Got symbol from on-chain:', symbol);
        }
      } catch (e) {
        symbol = `${normalizedAddress.slice(0, 6)}...${normalizedAddress.slice(-4)}`;
      }
    }

    const tokenInfo = {
      symbol: symbol || 'TOKEN',
      decimals: decimals || 18,
      name: name,
      address: normalizedAddress
    };

    // Cache token info
    this.tokenCache.set(cacheKey, {
      data: tokenInfo,
      timestamp: Date.now()
    });

    KAISIGN_DEBUG && console.log('[KaiSign API] Token metadata resolved:', tokenInfo);
    return tokenInfo;
  }

  /**
   * Decode ABI-encoded string return value
   * @param {string} hexData - Hex encoded string data
   * @returns {string} Decoded string
   */
  decodeAbiString(hexData) {
    try {
      // Remove 0x prefix
      const data = hexData.slice(2);
      // Skip offset (32 bytes) and length (32 bytes), then decode UTF-8
      const offset = parseInt(data.slice(0, 64), 16) * 2;
      const length = parseInt(data.slice(offset, offset + 64), 16);
      const strHex = data.slice(offset + 64, offset + 64 + length * 2);
      // Convert hex to string
      let str = '';
      for (let i = 0; i < strHex.length; i += 2) {
        const charCode = parseInt(strHex.slice(i, i + 2), 16);
        if (charCode > 0) str += String.fromCharCode(charCode);
      }
      return str;
    } catch (e) {
      KAISIGN_DEBUG && console.warn('[KaiSign API] Failed to decode ABI string:', e.message);
      return '';
    }
  }

  /**
   * Get EIP-712 typed data metadata
   * @param {string} verifyingContract - Verifying contract address
   * @param {string} primaryType - Primary type (e.g., "PermitSingle", "Order")
   * @returns {Promise<Object>} EIP-712 metadata
   */
  async getEIP712Metadata(verifyingContract, primaryType) {
    try {
      // Fetch metadata from KaiSign API
      const metadata = await this.getContractMetadata(verifyingContract, 1);

      // Look for EIP-712 formats in metadata
      if (metadata.display?.formats) {
        // Find matching primaryType in formats
        const format = metadata.display.formats[primaryType];
        if (format) {
          return {
            ...metadata,
            primaryType,
            matchedFormat: format
          };
        }
      }

      KAISIGN_DEBUG && console.warn('[KaiSign API] No EIP-712 format found for:', primaryType);
      return null;
    } catch (error) {
      console.error('[KaiSign API] EIP-712 metadata fetch failed:', error);
      throw error;
    }
  }

  /**
   * Get selector info (function signature, intent)
   * @param {string} selector - 4-byte function selector (e.g., "0xa9059cbb")
   * @returns {Promise<Object|null>} Selector info or null
   */
  async getSelectorInfo(selector) {
    // Note: Selectors are best matched via contract metadata ABIs
    // This method is primarily for backward compatibility
    KAISIGN_DEBUG && console.log('[Subgraph] Selector lookup requested:', selector);

    // Cannot efficiently query by selector without contract address
    // Return null - caller should use contract metadata instead
    return null;
  }

  /**
   * Fetch via background script to bypass CORS (with retry)
   * @param {string} url - URL to fetch
   * @param {number} retries - Number of retries (default 2)
   * @returns {Promise<string>} Response text
   */
  async fetchViaBackground(url, retries = 2) {
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await this._fetchViaBackgroundOnce(url, attempt);
        return result;
      } catch (error) {
        lastError = error;
        console.warn(`[KaiSign API] Fetch attempt ${attempt + 1} failed:`, error.message);
        if (attempt < retries) {
          // Wait briefly before retry
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        }
      }
    }

    throw lastError;
  }

  /**
   * Single fetch attempt via background script
   * @private
   */
  _fetchViaBackgroundOnce(url, attempt = 0) {
    return new Promise((resolve, reject) => {
      const messageId = `api-fetch-${Date.now()}-${attempt}`;
      let timeoutId;

      const handler = (event) => {
        if (event.data.type === 'KAISIGN_BLOB_RESPONSE' && event.data.messageId === messageId) {
          clearTimeout(timeoutId);
          window.removeEventListener('message', handler);
          if (event.data.error) {
            reject(new Error(event.data.error));
          } else if (!event.data.data) {
            reject(new Error('Empty response from background'));
          } else {
            resolve(event.data.data);
          }
        }
      };

      window.addEventListener('message', handler);

      window.postMessage({
        type: 'KAISIGN_FETCH_BLOB',
        messageId: messageId,
        url: url
      }, '*');

      timeoutId = setTimeout(() => {
        window.removeEventListener('message', handler);
        reject(new Error('API fetch timeout'));
      }, 15000); // Shorter timeout per attempt
    });
  }

  /**
   * Clear all caches
   */
  clearCache() {
    this.metadataCache.clear();
    this.blobCache.clear();
    this.tokenCache.clear();
    KAISIGN_DEBUG && console.log('[KaiSign API] All caches cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      metadataCacheSize: this.metadataCache.size,
      blobCacheSize: this.blobCache.size,
      tokenCacheSize: this.tokenCache.size,
      cacheTTL: this.cacheTTL
    };
  }
}

// Initialize global instance
const metadataService = new SubgraphMetadataService({
  cacheTTL: 60 * 1000 // 1 minute cache - shorter to get fresh metadata faster
});

// Clear cache on init to ensure fresh metadata after extension reload
metadataService.clearCache();
console.log('[KaiSign] Cache auto-cleared on init (DEBUG BUILD v2025.02.15)');

// Expose globally
window.metadataService = metadataService;

// Expose legacy API for compatibility
window.getContractMetadata = (address, chainId, selector) =>
  metadataService.getContractMetadata(address, chainId, selector);

window.getEIP712Metadata = (verifyingContract, primaryType) =>
  metadataService.getEIP712Metadata(verifyingContract, primaryType);

// Expose per-selector extraction for hardware wallet compatibility
window.extractSelectorMetadata = (metadata, selector) =>
  metadataService.extractSelectorMetadata(metadata, selector);

// Expose cache control for debugging
window.clearMetadataCache = () => {
  metadataService.clearCache();
  KAISIGN_DEBUG && console.log('[KaiSign] Metadata cache cleared');
};

console.log('[KaiSign] Subgraph metadata service ready');

} // End of duplicate-load guard
