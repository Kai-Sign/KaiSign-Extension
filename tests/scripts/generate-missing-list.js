/**
 * Generate Missing Contracts List
 *
 * Compares local fixtures against production API and generates
 * a list of contracts that need to be submitted.
 *
 * Usage:
 *   npm run audit-metadata
 *
 * Output:
 *   tests/missing-contracts.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { LocalMetadataService } from '../lib/local-metadata-service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = path.resolve(__dirname, '../fixtures');
const OUTPUT_PATH = path.resolve(__dirname, '../missing-contracts.json');
const KAISIGN_API_URL = 'https://kai-sign-production.up.railway.app';

// Rate limiting
const DELAY_MS = 200;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch metadata from production API
 */
async function fetchFromProductionApi(address, chainId = 1) {
  const url = `${KAISIGN_API_URL}/api/py/contract/${address}?chain_id=${chainId}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.success && data.metadata) {
      return data.metadata;
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Count display formats in metadata
 */
function countFormats(metadata) {
  if (!metadata?.display?.formats) return 0;
  return Object.keys(metadata.display.formats).length;
}

/**
 * Extract contract info from metadata file
 */
function extractContractInfo(metadata, filePath) {
  const context = metadata.context || {};
  const contract = context.contract || {};
  const eip712 = context.eip712 || {};

  const relativePath = path.relative(FIXTURES_PATH, filePath);

  return {
    address: contract.address || eip712.verifyingContract || null,
    chainId: contract.chainId || eip712.chainId || 1,
    name: contract.name || metadata.metadata?.name || path.basename(filePath, '.json'),
    fixture: relativePath,
    formats: countFormats(metadata),
    isEIP712: !!eip712.verifyingContract,
    isFacet: !!contract.facetOf,
    facetOf: contract.facetOf || null
  };
}

/**
 * Walk directory and collect all metadata files
 */
function walkDirectory(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walkDirectory(fullPath, files);
    } else if (entry.name.endsWith('.json') && !entry.name.startsWith('_')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Main audit function
 */
async function main() {
  console.log('');
  console.log('='.repeat(60));
  console.log('  KaiSign Metadata Audit');
  console.log('='.repeat(60));
  console.log('');

  // Initialize local metadata service
  const metadataService = new LocalMetadataService(FIXTURES_PATH);
  await metadataService.initialize();

  const metadataDir = path.join(FIXTURES_PATH, 'metadata');
  if (!fs.existsSync(metadataDir)) {
    console.error('Error: No metadata directory found at', metadataDir);
    process.exit(1);
  }

  // Collect all metadata files
  const files = walkDirectory(metadataDir);
  console.log(`Found ${files.length} metadata files\n`);

  const missing = [];
  const mismatched = [];
  const synced = [];
  const skipped = [];

  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const metadata = JSON.parse(content);
      const info = extractContractInfo(metadata, filePath);

      // Skip files without address (e.g., schema files)
      if (!info.address) {
        skipped.push({ fixture: info.fixture, reason: 'No address' });
        continue;
      }

      // Skip facet files (they belong to a Diamond)
      if (info.isFacet) {
        skipped.push({ fixture: info.fixture, reason: 'Diamond facet' });
        continue;
      }

      const shortAddr = info.address.slice(0, 10) + '...';
      process.stdout.write(`  Checking ${info.name.padEnd(35)} ${shortAddr} `);

      // Check production API
      const apiMetadata = await fetchFromProductionApi(info.address, info.chainId);
      const apiFormats = countFormats(apiMetadata);

      if (!apiMetadata) {
        console.log('[ MISSING ]');
        missing.push(info);
      } else if (apiFormats < info.formats) {
        console.log(`[ MISMATCH: ${apiFormats} < ${info.formats} ]`);
        mismatched.push({
          ...info,
          apiFormats,
          localFormats: info.formats
        });
      } else {
        console.log('[ OK ]');
        synced.push(info);
      }

      await sleep(DELAY_MS);
    } catch (e) {
      console.error(`  Error processing ${filePath}:`, e.message);
      skipped.push({ fixture: path.relative(FIXTURES_PATH, filePath), reason: e.message });
    }
  }

  // Generate output
  const output = {
    generated: new Date().toISOString(),
    summary: {
      total: files.length,
      missing: missing.length,
      mismatched: mismatched.length,
      synced: synced.length,
      skipped: skipped.length
    },
    missing,
    mismatched,
    skipped
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

  // Print summary
  console.log('');
  console.log('='.repeat(60));
  console.log('  SUMMARY');
  console.log('='.repeat(60));
  console.log('');
  console.log(`  Total files:       ${files.length}`);
  console.log(`  Missing from API:  ${missing.length}`);
  console.log(`  Mismatched:        ${mismatched.length}`);
  console.log(`  Synced:            ${synced.length}`);
  console.log(`  Skipped:           ${skipped.length}`);
  console.log('');
  console.log(`  Output: ${OUTPUT_PATH}`);
  console.log('');

  if (missing.length > 0) {
    console.log('  Missing contracts (need submission):');
    for (const c of missing.slice(0, 10)) {
      console.log(`    - ${c.name} (${c.address.slice(0, 10)}...)`);
    }
    if (missing.length > 10) {
      console.log(`    ... and ${missing.length - 10} more`);
    }
    console.log('');
  }

  if (mismatched.length > 0) {
    console.log('  Mismatched contracts (local has more formats):');
    for (const c of mismatched.slice(0, 5)) {
      console.log(`    - ${c.name}: local=${c.localFormats}, api=${c.apiFormats}`);
    }
    if (mismatched.length > 5) {
      console.log(`    ... and ${mismatched.length - 5} more`);
    }
    console.log('');
  }

  console.log('='.repeat(60));
  console.log('');
}

main().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
