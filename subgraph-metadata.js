/**
 * Subgraph-Only Metadata Service
 * Fetches all ERC-7730 metadata from subgraph (no local files, no embedded metadata)
 */

console.log('[KaiSign] Subgraph metadata service loading...');

class SubgraphMetadataService {
  constructor(config) {
    this.subgraphUrl = config.subgraphUrl;
    this.blobscanBaseUrl = config.blobscanBaseUrl || 'https://api.blobscan.com';
    this.cacheTTL = config.cacheTTL || 300000; // 5 minutes default

    // Chain-specific Blobscan URLs
    this.blobscanUrls = {
      1: 'https://api.blobscan.com', // Mainnet
      11155111: 'https://api.sepolia.blobscan.com', // Sepolia
      17000: 'https://api.holesky.blobscan.com', // Holesky
      10: 'https://api.blobscan.com', // Optimism (uses mainnet)
      8453: 'https://api.blobscan.com' // Base (uses mainnet)
    };

    // Caches
    this.metadataCache = new Map(); // address+chainId -> metadata
    this.blobCache = new Map(); // blobHash -> metadata
    this.tokenCache = new Map(); // address -> token info

    console.log('[Subgraph] Service initialized:', {
      subgraph: this.subgraphUrl,
      blobscanBaseUrl: this.blobscanBaseUrl,
      cacheTTL: this.cacheTTL
    });
  }

  /**
   * Get contract metadata from KaiSign proxy API
   * @param {string} address - Contract address
   * @param {number} chainId - Chain ID
   * @param {string} selector - Optional function selector for better matching
   * @returns {Promise<Object>} ERC-7730 metadata
   */
  async getContractMetadata(address, chainId, selector) {
    const normalizedAddress = address.toLowerCase();
    const cacheKey = `${normalizedAddress}-${chainId}-${selector || ''}`;

    // Check cache first
    const cached = this.metadataCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      console.log('[KaiSign API] Cache hit for:', normalizedAddress);
      return cached.data;
    }

    try {
      console.log('[KaiSign API] Fetching metadata for:', normalizedAddress, 'chain:', chainId);

      // Fetch via KaiSign API /contract endpoint with chainId query parameter
      const apiUrl = `https://kai-sign-production.up.railway.app/api/py/contract/${normalizedAddress}?chain_id=${chainId}`;

      const rawData = await this.fetchViaBackground(apiUrl);
      const metadata = JSON.parse(rawData);

      // Cache result
      this.metadataCache.set(cacheKey, {
        data: metadata,
        timestamp: Date.now()
      });

      console.log('[KaiSign API] Successfully fetched metadata for:', normalizedAddress);
      return metadata;

    } catch (error) {
      console.error('[KaiSign API] Failed to fetch metadata:', error);
      throw new Error(`⚠️ KaiSign API unavailable: ${error.message}`);
    }
  }

  /**
   * Get token metadata (symbol, decimals, name)
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
      return cached.data;
    }

    try {
      const metadata = await this.getContractMetadata(normalizedAddress, chainId);

      // Extract token info from metadata
      const tokenInfo = {
        symbol: metadata.metadata?.symbol || metadata.context?.contract?.symbol || 'TOKEN',
        decimals: metadata.metadata?.decimals || metadata.context?.contract?.decimals || 18,
        name: metadata.metadata?.name || metadata.context?.contract?.name || 'Unknown Token',
        address: normalizedAddress
      };

      // Cache token info
      this.tokenCache.set(cacheKey, {
        data: tokenInfo,
        timestamp: Date.now()
      });

      return tokenInfo;
    } catch (error) {
      console.warn('[Subgraph] Token metadata not found:', normalizedAddress, error.message);
      // Return default values if not found
      return {
        symbol: 'UNKNOWN',
        decimals: 18,
        name: 'Unknown Token',
        address: normalizedAddress
      };
    }
  }

  /**
   * Get EIP-712 typed data metadata
   * @param {string} verifyingContract - Verifying contract address
   * @param {string} primaryType - Primary type (e.g., "PermitSingle", "SafeTx")
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

      console.warn('[KaiSign API] No EIP-712 format found for:', primaryType);
      return metadata;
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
    console.log('[Subgraph] Selector lookup requested:', selector);

    // Cannot efficiently query by selector without contract address
    // Return null - caller should use contract metadata instead
    return null;
  }

  /**
   * Fetch via background script to bypass CORS
   * @param {string} url - URL to fetch
   * @returns {Promise<string>} Response text
   */
  async fetchViaBackground(url) {
    return new Promise((resolve, reject) => {
      const messageId = 'api-fetch-' + Date.now();

      const handler = (event) => {
        if (event.data.type === 'KAISIGN_BLOB_RESPONSE' && event.data.messageId === messageId) {
          window.removeEventListener('message', handler);
          if (event.data.error) {
            reject(new Error(event.data.error));
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

      setTimeout(() => {
        window.removeEventListener('message', handler);
        reject(new Error('API fetch timeout'));
      }, 30000);
    });
  }

  /**
   * Clear all caches
   */
  clearCache() {
    this.metadataCache.clear();
    this.blobCache.clear();
    this.tokenCache.clear();
    console.log('[KaiSign API] All caches cleared');
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
  subgraphUrl: 'https://api.studio.thegraph.com/query/117022/kaisign-subgraph/version/latest',
  blobscanBaseUrl: 'https://api.blobscan.com', // Mainnet default, chain-specific URLs in constructor
  cacheTTL: 5 * 60 * 1000 // 5 minutes
});

// Expose globally
window.metadataService = metadataService;

// Expose legacy API for compatibility
window.getContractMetadata = (address, chainId, selector) =>
  metadataService.getContractMetadata(address, chainId, selector);

window.getEIP712Metadata = (verifyingContract, primaryType) =>
  metadataService.getEIP712Metadata(verifyingContract, primaryType);

console.log('[KaiSign] Subgraph metadata service ready');
