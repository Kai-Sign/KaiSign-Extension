/**
 * Metadata Loader
 *
 * Loads ERC-7730 metadata JSON files for tests
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const METADATA_DIR = path.resolve(__dirname, '../fixtures/metadata');

/**
 * Load metadata from JSON file
 * @param {string} relativePath - Path relative to fixtures/metadata (e.g., 'aa/erc4337-entrypoint-v06.json')
 * @returns {Object} Metadata object
 */
export function loadMetadata(relativePath) {
  const fullPath = path.join(METADATA_DIR, relativePath);

  if (!fs.existsSync(fullPath)) {
    throw new Error(`Metadata file not found: ${fullPath}`);
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  return JSON.parse(content);
}

/**
 * Load metadata and add contract address if needed
 * @param {string} relativePath - Path relative to fixtures/metadata
 * @param {string} address - Optional contract address to add/override
 * @returns {Object} Metadata object
 */
export function loadMetadataWithAddress(relativePath, address) {
  const metadata = loadMetadata(relativePath);

  if (address && metadata.context?.contract) {
    metadata.context.contract.address = address.toLowerCase();
  }

  return metadata;
}
