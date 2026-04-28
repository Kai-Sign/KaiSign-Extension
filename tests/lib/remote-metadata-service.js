/**
 * Remote Metadata Service
 *
 * Fetches ERC-7730 metadata from KaiSign production API.
 * Implements the same interface as LocalMetadataService for seamless swapping.
 */

const KAISIGN_API_URL = 'https://kai-sign-production.up.railway.app/api/py/contract';

export class RemoteMetadataService {
  constructor() {
    this.metadataCache = new Map();
    this.tokenCache = new Map();
    // Diamond facet index: diamondAddress -> selector -> metadata
    this.diamondFacetIndex = new Map();
    this.initialized = true; // No filesystem init needed for remote
  }

  /**
   * Initialize the service (no-op for remote API)
   */
  async initialize() {
    // No-op - API is always ready
    console.log('[RemoteMetadataService] Ready (using KaiSign API)');
  }

  /**
   * Get contract metadata from KaiSign API
   * @param {string} address - Contract address
   * @param {number} chainId - Chain ID
   * @param {string} selector - Optional function selector (for Diamond facets)
   * @returns {Promise<Object|null>} - ERC-7730 metadata or null
   */
  async getContractMetadata(address, chainId, selector = null) {
    const normalizedAddress = address.toLowerCase();
    const normalizedSelector = selector ? selector.toLowerCase() : null;
    const cacheKey = `${normalizedAddress}-${chainId}`;
    const selectorKey = normalizedSelector ? `${cacheKey}-${normalizedSelector}` : null;

    // Check selector-specific cache first (Diamond per-facet metadata)
    if (selectorKey && this.metadataCache.has(selectorKey)) {
      return this.metadataCache.get(selectorKey);
    }

    // Check base cache (full contract metadata)
    if (this.metadataCache.has(cacheKey)) {
      return this.metadataCache.get(cacheKey);
    }

    // Try Diamond facet index (from addMetadata)
    if (normalizedSelector && this.diamondFacetIndex.has(normalizedAddress)) {
      const selectorMap = this.diamondFacetIndex.get(normalizedAddress);
      const facetMetadata = selectorMap.get(normalizedSelector);
      if (facetMetadata) {
        this.metadataCache.set(selectorKey, facetMetadata);
        return facetMetadata;
      }
    }

    // Fetch from API with retry for rate limiting
    try {
      const metadata = await this._fetchWithRetry(normalizedAddress, chainId);
      // Cache result (even null) to avoid repeated failing requests
      this.metadataCache.set(cacheKey, metadata);
      return metadata;
    } catch (e) {
      console.log(`[RemoteMetadataService] Fetch failed for ${normalizedAddress}:`, e.message);
      this.metadataCache.set(cacheKey, null);
      return null;
    }
  }

  /**
   * Fetch metadata from API with retry on 429
   */
  async _fetchWithRetry(normalizedAddress, chainId, retries = 3) {
    const url = `${KAISIGN_API_URL}/${normalizedAddress}?chain_id=${chainId}`;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const response = await fetch(url);

      if (response.status === 429) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
        console.log(`[RemoteMetadataService] Rate limited, retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      if (!response.ok) {
        console.log(`[RemoteMetadataService] API returned ${response.status} for ${normalizedAddress}`);
        return null;
      }

      const data = await response.json();

      if (!data.success || !data.metadata) {
        console.log(`[RemoteMetadataService] No metadata for ${normalizedAddress}`);
        return null;
      }

      const metadata = data.metadata;
      const registryAddress = this._resolveRegistryAddress(data, metadata);
      if (registryAddress) {
        metadata._registryAddress = registryAddress;
      }

      // v1.0.0 KaiSign backend response envelope (single shape across all
      // /api/py/contract/{address} paths): { success, blob_hash, metadata,
      // error, source }. The leaf inputs (chainId, extcodehash, metadataHash,
      // revoked) are NOT shipped by the backend — they're derived client-side
      // by the extension (eth_getCode, canonical metadata hash, two-leaf
      // merkle proof against the cached registry root). The test harness has
      // no chain access, so it can't verify; mark accordingly instead of
      // fabricating null leaf fields and an always-true `verified` flag.
      metadata._verification = {
        verified: false,
        source: 'api-no-verify',
        details: 'Metadata served by backend; merkle-proof verification ' +
          'requires chain access (not available in test harness)',
        blobHash: data.blob_hash || null,
        backendSource: data.source || null,
        registryAddress
      };

      return metadata;
    }

    console.log(`[RemoteMetadataService] Exhausted retries for ${normalizedAddress}`);
    return null;
  }

  _resolveRegistryAddress(response, metadata) {
    const candidates = [
      response?.registry_address,
      response?.registryAddress,
      response?.registry?.address,
      metadata?._registryAddress,
      metadata?.registryAddress,
      metadata?.registry_address,
      metadata?.context?.contract?.registryAddress,
      metadata?.context?.contract?.registry_address,
      metadata?.context?.contract?.registry?.address
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && /^0x[a-fA-F0-9]{40}$/.test(candidate.trim())) {
        return candidate.trim().toLowerCase();
      }
    }
    return null;
  }

  /**
   * Get EIP-712 metadata
   * @param {string} verifyingContract - Verifying contract address
   * @param {string} primaryType - Primary type name
   * @returns {Promise<Object|null>} - Metadata or null
   */
  async getEIP712Metadata(verifyingContract, primaryType) {
    const normalizedAddress = verifyingContract.toLowerCase();
    const eip712CacheKey = `eip712-${normalizedAddress}-${primaryType}`;

    // Check EIP-712 specific cache first
    if (this.metadataCache.has(eip712CacheKey)) {
      return this.metadataCache.get(eip712CacheKey);
    }

    // Try existing contract metadata cache
    let metadata = await this.getContractMetadata(normalizedAddress, 1);

    // If no metadata or cached metadata lacks this format, fetch fresh from API
    if (!metadata?.display?.formats?.[primaryType]) {
      try {
        const fresh = await this._fetchWithRetry(normalizedAddress, 1);
        if (fresh) metadata = fresh;
      } catch { /* use existing metadata */ }
    }

    if (metadata?.display?.formats?.[primaryType]) {
      const result = {
        ...metadata,
        primaryType,
        matchedFormat: metadata.display.formats[primaryType]
      };
      this.metadataCache.set(eip712CacheKey, result);
      return result;
    }

    // Cache negative result to avoid repeated API calls
    this.metadataCache.set(eip712CacheKey, metadata);
    return metadata;
  }

  /**
   * Get token metadata
   * @param {string} address - Token address
   * @param {number} chainId - Chain ID
   * @returns {Promise<Object>} - Token info
   */
  async getTokenMetadata(address, chainId = 1) {
    const normalizedAddress = address.toLowerCase();
    const cacheKey = `token-${normalizedAddress}-${chainId}`;

    if (this.tokenCache.has(cacheKey)) {
      return this.tokenCache.get(cacheKey);
    }

    const metadata = await this.getContractMetadata(normalizedAddress, chainId);

    const tokenInfo = {
      symbol: metadata?.metadata?.symbol || metadata?.context?.contract?.symbol || null,
      decimals: metadata?.metadata?.decimals || metadata?.context?.contract?.decimals || 18,
      name: metadata?.metadata?.name || metadata?.context?.contract?.name || 'Unknown Token',
      address: normalizedAddress,
      hasMetadata: !!(metadata?.metadata?.symbol || metadata?.context?.contract?.symbol)
    };

    this.tokenCache.set(cacheKey, tokenInfo);
    return tokenInfo;
  }

  /**
   * Add metadata directly (for test-specific overrides)
   * @param {string} address - Contract address
   * @param {Object} metadata - ERC-7730 metadata
   * @param {number} chainId - Chain ID (default: 1)
   */
  addMetadata(address, metadata, chainId = 1) {
    const normalizedAddress = address.toLowerCase();
    this.metadataCache.set(`${normalizedAddress}-${chainId}`, metadata);

    // Also populate diamondFacetIndex for facet metadata
    if (metadata.context?.contract?.facetOf) {
      const diamondAddr = metadata.context.contract.facetOf.toLowerCase();
      if (!this.diamondFacetIndex.has(diamondAddr)) {
        this.diamondFacetIndex.set(diamondAddr, new Map());
      }
      const selectorMap = this.diamondFacetIndex.get(diamondAddr);
      for (const abiEntry of (metadata.context?.contract?.abi || [])) {
        if (abiEntry.selector) {
          selectorMap.set(abiEntry.selector.toLowerCase(), metadata);
        }
      }
    }
  }

  addTokenMetadata(address, tokenInfo, chainId = 1) {
    const cacheKey = `token-${address.toLowerCase()}-${chainId}`;
    this.tokenCache.set(cacheKey, tokenInfo);
  }

  /**
   * Clear all caches
   */
  clearCache() {
    this.metadataCache.clear();
    this.tokenCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    let diamondSelectors = 0;
    for (const selectorMap of this.diamondFacetIndex.values()) {
      diamondSelectors += selectorMap.size;
    }
    return {
      metadataCacheSize: this.metadataCache.size,
      tokenCacheSize: this.tokenCache.size,
      diamondProxies: this.diamondFacetIndex.size,
      diamondSelectors
    };
  }
}

export default RemoteMetadataService;
