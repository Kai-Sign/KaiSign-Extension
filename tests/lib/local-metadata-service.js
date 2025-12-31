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
      } else if (entry.name.endsWith('.json')) {
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

          if (address) {
            this.addressToFilePath.set(address, fullPath);
            // Also index by checksum address if different
            const checksummed = address; // ethers.getAddress(address) if needed
            if (checksummed !== address) {
              this.addressToFilePath.set(checksummed.toLowerCase(), fullPath);
            }
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
    const cacheKey = `${normalizedAddress}-${chainId}`;

    // Check cache first
    if (this.metadataCache.has(cacheKey)) {
      return this.metadataCache.get(cacheKey);
    }

    // Look up file path
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
    return {
      metadataCacheSize: this.metadataCache.size,
      tokenCacheSize: this.tokenCache.size,
      indexedContracts: this.addressToFilePath.size
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
