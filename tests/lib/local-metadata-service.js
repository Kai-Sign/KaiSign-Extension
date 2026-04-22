/**
 * Local Metadata Service
 *
 * Loads ERC-7730 metadata from local filesystem instead of API.
 * Implements the same interface as SubgraphMetadataService.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class LocalMetadataService {
  constructor(fixturesPath) {
    this.fixturesPath = fixturesPath || path.resolve(__dirname, '../fixtures');
    this.metadataCache = new Map(); // address -> metadata
    this.addressToFilePath = new Map(); // address-chainId -> file path
    this.addressFallbackToFilePath = new Map(); // address -> file path (legacy fallback)
    this.tokenCache = new Map(); // address -> token info
    // Diamond facet index: diamondAddress -> selector -> metadata file path
    this.diamondFacetIndex = new Map();
    this.initialized = false;
  }

  /**
   * Initialize the service by scanning metadata directory
   */
  async initialize() {
    if (this.initialized) return;

    const metadataDir = path.join(this.fixturesPath, 'metadata');

    if (!fs.existsSync(metadataDir)) {
      console.warn('[LocalMetadataService] Metadata directory not found:', metadataDir);
      this.initialized = true;
      return;
    }

    await this.walkDirectory(metadataDir);
    this.initialized = true;

    console.log(`[LocalMetadataService] Indexed ${this.addressToFilePath.size} contracts`);
  }

  /**
   * Recursively walk directory and index metadata files by contract address
   */
  async walkDirectory(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await this.walkDirectory(fullPath);
      } else if (entry.name.endsWith('.json') && !entry.name.startsWith('_')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const metadata = JSON.parse(content);

          // Extract contract address and chainId from metadata
          let address = null;
          let chainId = null;

          // Try different paths in ERC-7730 format
          if (metadata.context?.contract?.address) {
            address = metadata.context.contract.address.toLowerCase();
            chainId = Number(metadata.context.contract.chainId) || null;
          } else if (metadata.context?.eip712?.verifyingContract) {
            address = metadata.context.eip712.verifyingContract.toLowerCase();
            chainId = Number(metadata.context.eip712.chainId) || null;
          } else if (metadata.address) {
            address = metadata.address.toLowerCase();
          }

          // Handle per-facet Diamond metadata files
          const facetOf = metadata.context?.contract?.facetOf;
          if (facetOf) {
            const diamondAddr = facetOf.toLowerCase();

            // Index by diamond address + selector for each ABI entry
            if (!this.diamondFacetIndex.has(diamondAddr)) {
              this.diamondFacetIndex.set(diamondAddr, new Map());
            }
            const selectorMap = this.diamondFacetIndex.get(diamondAddr);

            const abiEntries = metadata.context?.contract?.abi || [];
            for (const abiEntry of abiEntries) {
              if (abiEntry.selector) {
                selectorMap.set(abiEntry.selector.toLowerCase(), fullPath);
              }
            }

            // Also index by facet deployment address
            const deployments = metadata.context?.contract?.deployments;
            if (Array.isArray(deployments)) {
              for (const dep of deployments) {
                if (dep.address) {
                  this.setFilePathForAddress(dep.address, dep.chainId, fullPath);
                }
              }
            } else if (deployments && typeof deployments === 'object') {
              for (const dep of Object.values(deployments)) {
                if (dep.address) {
                  this.setFilePathForAddress(dep.address, dep.chainId, fullPath);
                }
              }
            }
          }

          // ERC-7730: Also index by deployments[].address for non-facet contracts
          if (!facetOf) {
            const deployments = metadata.context?.contract?.deployments;
            if (Array.isArray(deployments)) {
              for (const dep of deployments) {
                if (dep.address) {
                  this.setFilePathForAddress(dep.address, dep.chainId, fullPath);
                }
              }
            }
          }

          if (address) {
            this.setFilePathForAddress(address, chainId, fullPath);
          }
        } catch (e) {
          console.warn(`[LocalMetadataService] Failed to parse ${fullPath}:`, e.message);
        }
      }
    }
  }

  /**
   * Get contract metadata
   * @param {string} address - Contract address
   * @param {number} chainId - Chain ID
   * @param {string} selector - Optional function selector
   * @returns {Promise<Object|null>} - ERC-7730 metadata or null
   */
  async getContractMetadata(address, chainId, selector = null) {
    if (!this.initialized) {
      await this.initialize();
    }

    const normalizedAddress = address.toLowerCase();
    const normalizedSelector = selector ? selector.toLowerCase() : null;

    // Two cache key formats:
    // - baseKey: for full contract metadata (from addMetadata or file loading)
    // - selectorKey: for Diamond per-facet metadata (selector-specific)
    const baseKey = `${normalizedAddress}-${chainId}`;
    const selectorKey = normalizedSelector ? `${baseKey}-${normalizedSelector}` : null;

    console.log(`[LocalMetadataService] getContractMetadata: address=${normalizedAddress}, chainId=${chainId}, selector=${normalizedSelector || '(none)'}`);
    console.log(`[LocalMetadataService] Cache keys: baseKey=${baseKey}, selectorKey=${selectorKey || '(none)'}`);

    // Check selector-specific cache first (Diamond per-facet metadata)
    if (selectorKey && this.metadataCache.has(selectorKey)) {
      console.log(`[LocalMetadataService] Cache HIT selectorKey: ${selectorKey}`);
      return this.metadataCache.get(selectorKey);
    }

    // Check base cache (full contract metadata from addMetadata or file)
    if (this.metadataCache.has(baseKey)) {
      console.log(`[LocalMetadataService] Cache HIT baseKey: ${baseKey}`);
      return this.metadataCache.get(baseKey);
    }

    console.log(`[LocalMetadataService] Cache MISS for both keys`);

    // Try Diamond facet index (address + selector -> per-facet file or metadata object)
    if (normalizedSelector && this.diamondFacetIndex.has(normalizedAddress)) {
      const selectorMap = this.diamondFacetIndex.get(normalizedAddress);
      const facetEntry = selectorMap.get(normalizedSelector);
      if (facetEntry) {
        console.log(`[LocalMetadataService] Found in diamondFacetIndex: address=${normalizedAddress}, selector=${normalizedSelector}`);
        // facetEntry is either a file path (string, from walkDirectory) or metadata object (from addMetadata)
        if (typeof facetEntry === 'string') {
          try {
            console.log(`[LocalMetadataService] Reading facet file: ${facetEntry}`);
            const content = fs.readFileSync(facetEntry, 'utf8');
            const metadata = JSON.parse(content);
            this.metadataCache.set(selectorKey, metadata);
            console.log(`[LocalMetadataService] Cached facet metadata with selectorKey: ${selectorKey}`);
            return metadata;
          } catch (e) {
            console.error(`[LocalMetadataService] Failed to read facet file ${facetEntry}:`, e.message);
          }
        } else {
          console.log(`[LocalMetadataService] Using pre-loaded facet metadata from addMetadata`);
          this.metadataCache.set(selectorKey, facetEntry);
          console.log(`[LocalMetadataService] Cached facet metadata with selectorKey: ${selectorKey}`);
          return facetEntry;
        }
      }
    }

    // Look up file path by address+chainId first, then fall back to address-only.
    const filePath =
      this.addressToFilePath.get(`${normalizedAddress}-${chainId}`) ||
      this.addressFallbackToFilePath.get(normalizedAddress);

    if (!filePath) {
      console.log(`[LocalMetadataService] No metadata found for ${normalizedAddress} in addressToFilePath map`);
      console.log(`[LocalMetadataService] addressToFilePath has ${this.addressToFilePath.size} entries`);
      return null;
    }

    console.log(`[LocalMetadataService] Found file path: ${filePath}`);

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const metadata = JSON.parse(content);

      // Cache with base key (full contract metadata)
      this.metadataCache.set(baseKey, metadata);
      console.log(`[LocalMetadataService] Cached file metadata with baseKey: ${baseKey}`);

      // Also cache selector-specific keys for each ABI entry
      const abiEntries = metadata.context?.contract?.abi || [];
      for (const abiEntry of abiEntries) {
        if (abiEntry.selector) {
          const selector = abiEntry.selector.toLowerCase();
          const selectorKey = `${baseKey}-${selector}`;
          this.metadataCache.set(selectorKey, metadata);
          console.log(`[LocalMetadataService] Cached selectorKey: ${selectorKey}`);
        }
      }

      return metadata;
    } catch (e) {
      console.error(`[LocalMetadataService] Failed to read ${filePath}:`, e.message);
      return null;
    }
  }

  /**
   * Get EIP-712 metadata
   * @param {string} verifyingContract - Verifying contract address
   * @param {string} primaryType - Primary type name
   * @returns {Promise<Object|null>} - Metadata or null
   */
  async getEIP712Metadata(verifyingContract, primaryType) {
    const metadata = await this.getContractMetadata(verifyingContract, 1);

    if (metadata?.display?.formats?.[primaryType]) {
      return {
        ...metadata,
        primaryType,
        matchedFormat: metadata.display.formats[primaryType]
      };
    }

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

    try {
      const metadata = await this.getContractMetadata(normalizedAddress, chainId);

      const tokenInfo = {
        // Return null for symbol if no metadata exists - allows fallback to shortened address
        symbol: metadata?.metadata?.symbol || metadata?.context?.contract?.symbol || null,
        decimals: metadata?.metadata?.decimals || metadata?.context?.contract?.decimals || 18,
        name: metadata?.metadata?.name || metadata?.context?.contract?.name || 'Unknown Token',
        address: normalizedAddress,
        // Flag indicating whether this came from actual metadata
        hasMetadata: !!(metadata?.metadata?.symbol || metadata?.context?.contract?.symbol)
      };

      this.tokenCache.set(cacheKey, tokenInfo);
      return tokenInfo;
    } catch (e) {
      return {
        symbol: 'UNKNOWN',
        decimals: 18,
        name: 'Unknown Token',
        address: normalizedAddress
      };
    }
  }

  /**
   * Add metadata directly (for testing)
   * @param {string} address - Contract address
   * @param {Object} metadata - ERC-7730 metadata
   * @param {number} chainId - Chain ID (default: 1)
   */
  addMetadata(address, metadata, chainId = 1) {
    const normalizedAddress = address.toLowerCase();
    const baseKey = `${normalizedAddress}-${chainId}`;
    
    console.log(`[LocalMetadataService] addMetadata: address=${normalizedAddress}, chainId=${chainId}`);
    console.log(`[LocalMetadataService] addMetadata caching with baseKey: ${baseKey}`);
    
    this.metadataCache.set(baseKey, metadata);

    // Also populate selector-specific cache for each ABI entry (non-diamond)
    // This ensures selector-specific lookups (used by recursive decoder) hit cache
    const abiEntries = metadata.context?.contract?.abi || [];
    for (const abiEntry of abiEntries) {
      if (abiEntry.selector) {
        const selector = abiEntry.selector.toLowerCase();
        const selectorKey = `${baseKey}-${selector}`;
        this.metadataCache.set(selectorKey, metadata);
        console.log(`[LocalMetadataService] addMetadata cached selectorKey: ${selectorKey}`);
      }
    }

    // Also populate diamondFacetIndex for facet metadata
    if (metadata.context?.contract?.facetOf) {
      const diamondAddr = metadata.context.contract.facetOf.toLowerCase();
      if (!this.diamondFacetIndex.has(diamondAddr)) {
        this.diamondFacetIndex.set(diamondAddr, new Map());
      }
      const selectorMap = this.diamondFacetIndex.get(diamondAddr);
      for (const abiEntry of abiEntries) {
        if (abiEntry.selector) {
          const selector = abiEntry.selector.toLowerCase();
          selectorMap.set(selector, metadata);
          console.log(`[LocalMetadataService] addMetadata added to diamondFacetIndex: diamond=${diamondAddr}, selector=${selector}`);
        }
      }
    }
    
    // Check if we should also add to addressToFilePath for file lookup fallback
    const hasAddressInMetadata = metadata.context?.contract?.address || metadata.address;
    if (hasAddressInMetadata) {
      console.log(`[LocalMetadataService] addMetadata: metadata contains address ${hasAddressInMetadata}, but NOT adding to addressToFilePath map`);
    }
    
    console.log(`[LocalMetadataService] addMetadata completed. Current cache size: ${this.metadataCache.size}`);
  }

  /**
   * Clear all caches
   */
  clearCache() {
    this.metadataCache.clear();
    this.tokenCache.clear();
  }

  setFilePathForAddress(address, chainId, filePath) {
    const normalizedAddress = address.toLowerCase();
    const numericChainId = Number(chainId);
    if (Number.isFinite(numericChainId) && numericChainId > 0) {
      this.addressToFilePath.set(`${normalizedAddress}-${numericChainId}`, filePath);
    }
    if (!this.addressFallbackToFilePath.has(normalizedAddress)) {
      this.addressFallbackToFilePath.set(normalizedAddress, filePath);
    }
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
      indexedContracts: this.addressToFilePath.size,
      diamondProxies: this.diamondFacetIndex.size,
      diamondSelectors
    };
  }

  /**
   * Get all indexed addresses
   */
  getIndexedAddresses() {
    return Array.from(this.addressToFilePath.keys());
  }
}

export default LocalMetadataService;
