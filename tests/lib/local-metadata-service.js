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
    this.addressToFilePath = new Map(); // address -> file path
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

          // Extract contract address from metadata
          let address = null;

          // Try different paths in ERC-7730 format
          if (metadata.context?.contract?.address) {
            address = metadata.context.contract.address.toLowerCase();
          } else if (metadata.context?.eip712?.verifyingContract) {
            address = metadata.context.eip712.verifyingContract.toLowerCase();
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
                  this.addressToFilePath.set(dep.address.toLowerCase(), fullPath);
                }
              }
            } else if (deployments && typeof deployments === 'object') {
              for (const dep of Object.values(deployments)) {
                if (dep.address) {
                  this.addressToFilePath.set(dep.address.toLowerCase(), fullPath);
                }
              }
            }
          }

          if (address) {
            this.addressToFilePath.set(address, fullPath);
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
    const cacheKey = `${normalizedAddress}-${chainId}-${normalizedSelector || ''}`;

    // Check cache first
    if (this.metadataCache.has(cacheKey)) {
      return this.metadataCache.get(cacheKey);
    }

    // Try Diamond facet index first (address + selector -> per-facet file or metadata object)
    if (normalizedSelector && this.diamondFacetIndex.has(normalizedAddress)) {
      const selectorMap = this.diamondFacetIndex.get(normalizedAddress);
      const facetEntry = selectorMap.get(normalizedSelector);
      if (facetEntry) {
        // facetEntry is either a file path (string, from walkDirectory) or metadata object (from addMetadata)
        if (typeof facetEntry === 'string') {
          try {
            const content = fs.readFileSync(facetEntry, 'utf8');
            const metadata = JSON.parse(content);
            this.metadataCache.set(cacheKey, metadata);
            return metadata;
          } catch (e) {
            console.error(`[LocalMetadataService] Failed to read facet file ${facetEntry}:`, e.message);
          }
        } else {
          this.metadataCache.set(cacheKey, facetEntry);
          return facetEntry;
        }
      }
    }

    // Look up file path by address
    const filePath = this.addressToFilePath.get(normalizedAddress);

    if (!filePath) {
      console.log(`[LocalMetadataService] No metadata found for ${normalizedAddress}`);
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const metadata = JSON.parse(content);

      // Cache result
      this.metadataCache.set(cacheKey, metadata);

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
        symbol: metadata?.metadata?.symbol || metadata?.context?.contract?.symbol || 'TOKEN',
        decimals: metadata?.metadata?.decimals || metadata?.context?.contract?.decimals || 18,
        name: metadata?.metadata?.name || metadata?.context?.contract?.name || 'Unknown Token',
        address: normalizedAddress
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
   */
  addMetadata(address, metadata) {
    const normalizedAddress = address.toLowerCase();
    this.metadataCache.set(`${normalizedAddress}-1`, metadata);

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
