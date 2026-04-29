#!/usr/bin/env node

/**
 * Metadata Sync Script
 *
 * Checks local metadata files against the on-chain state via the fork server
 * and optionally submits missing metadata for testing.
 *
 * Usage:
 *   node tests/scripts/sync-metadata.js --check              # Check status of all local metadata
 *   node tests/scripts/sync-metadata.js --submit-missing     # Submit missing to fork server
 *   node tests/scripts/sync-metadata.js --export-missing     # Export missing as JSON
 *   node tests/scripts/sync-metadata.js --api http://custom  # Use custom server URL
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Configuration ──────────────────────────────────────────────────────────

const DEFAULT_API_URL = 'http://localhost:3000';
const FIXTURES_DIR = path.resolve(__dirname, '../fixtures/metadata');

// ─── Canonical Stringify (must match kaisign-state-reader) ──────────────────

/**
 * Deterministic JSON.stringify with sorted keys.
 * Must match the server's canonicalStringify exactly.
 */
function canonicalStringify(obj) {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(v => canonicalStringify(v)).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  const pairs = keys.map(k => JSON.stringify(k) + ':' + canonicalStringify(obj[k]));
  return '{' + pairs.join(',') + '}';
}

/**
 * Compute keccak256 hash of metadata using canonical stringify.
 * Returns hex string with 0x prefix.
 */
function computeMetadataHash(metadata) {
  const canonical = canonicalStringify(metadata);
  return ethers.keccak256(ethers.toUtf8Bytes(canonical));
}

// ─── Contract Info Extraction ───────────────────────────────────────────────

/**
 * Extract contract address and chainId from metadata.
 * Handles both calldata metadata (context.contract) and EIP-712 metadata (context.eip712).
 */
function extractContractInfo(metadata, filePath) {
  // Calldata metadata
  if (metadata.context?.contract) {
    const { address, chainId } = metadata.context.contract;
    return {
      address: address?.toLowerCase(),
      chainId: chainId || 1,
      type: 'contract'
    };
  }

  // EIP-712 typed data metadata
  if (metadata.context?.eip712) {
    const domain = metadata.context.eip712.domain;
    // EIP-712 metadata may use wildcards - not syncable to specific contract
    if (domain?.verifyingContract && domain.verifyingContract !== '*') {
      return {
        address: domain.verifyingContract.toLowerCase(),
        chainId: domain.chainId || 1,
        type: 'eip712'
      };
    }
    // Wildcard domain - not address-specific
    return {
      address: null,
      chainId: domain?.chainId || 1,
      type: 'eip712-wildcard'
    };
  }

  return { address: null, chainId: null, type: 'unknown' };
}

// ─── File Scanning ──────────────────────────────────────────────────────────

/**
 * Recursively find all JSON files in directory.
 */
function findJsonFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findJsonFiles(fullPath, files);
    } else if (entry.name.endsWith('.json')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Get relative path from fixtures directory for display.
 */
function getRelativePath(filePath) {
  return path.relative(FIXTURES_DIR, filePath);
}

// ─── API Queries ────────────────────────────────────────────────────────────

/**
 * Query fork server for contract metadata.
 */
async function queryForkServer(apiUrl, address, chainId) {
  const url = `${apiUrl}/api/py/contract/${address}?chain_id=${chainId}`;

  try {
    const response = await fetch(url);
    return await response.json();
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Submit metadata to fork server.
 */
async function submitToForkServer(apiUrl, metadata, address, chainId) {
  const url = `${apiUrl}/admin/submit`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        metadata,
        contractAddress: address,
        chainId
      })
    });
    return await response.json();
  } catch (e) {
    return { error: e.message };
  }
}

// ─── Status Checking ────────────────────────────────────────────────────────

/**
 * Check status of a single metadata file.
 */
async function checkFileStatus(apiUrl, filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const metadata = JSON.parse(content);
  const relativePath = getRelativePath(filePath);
  const info = extractContractInfo(metadata, filePath);

  // Can't check wildcard EIP-712 or unknown types
  if (!info.address) {
    return {
      file: relativePath,
      status: 'SKIPPED',
      reason: info.type === 'eip712-wildcard' ? 'Wildcard domain' : 'No address',
      type: info.type
    };
  }

  // Query server
  const response = await queryForkServer(apiUrl, info.address, info.chainId);

  if (!response.success) {
    return {
      file: relativePath,
      status: 'MISSING',
      address: info.address,
      chainId: info.chainId,
      type: info.type,
      metadata
    };
  }

  // Compare hashes
  const localHash = computeMetadataHash(metadata);
  const serverHash = response.metadataHash;

  if (localHash === serverHash) {
    return {
      file: relativePath,
      status: 'FINALIZED',
      address: info.address,
      chainId: info.chainId,
      type: info.type,
      hash: localHash
    };
  }

  return {
    file: relativePath,
    status: 'MISMATCH',
    address: info.address,
    chainId: info.chainId,
    type: info.type,
    localHash,
    serverHash,
    metadata
  };
}

// ─── CLI Commands ───────────────────────────────────────────────────────────

/**
 * Check status of all local metadata files.
 */
async function checkAll(apiUrl) {
  console.log('\nMETADATA STATE CHECK');
  console.log('━'.repeat(55));
  console.log(`Server: ${apiUrl}`);

  const files = findJsonFiles(FIXTURES_DIR);
  console.log(`Local files: ${files.length}\n`);

  const results = {
    finalized: [],
    missing: [],
    mismatch: [],
    skipped: []
  };

  for (const file of files) {
    const status = await checkFileStatus(apiUrl, file);

    // Print status
    const symbol = {
      'FINALIZED': '✓',
      'MISSING': '✗',
      'MISMATCH': '⚠',
      'SKIPPED': '○'
    }[status.status];

    console.log(`${symbol} ${status.file}`);

    if (status.address) {
      console.log(`  ${status.address} (chainId: ${status.chainId})`);
    }

    console.log(`  ${status.status}${status.reason ? ` - ${status.reason}` : ''}`);

    if (status.status === 'MISMATCH') {
      console.log(`  Local:  ${status.localHash?.slice(0, 18)}...`);
      console.log(`  Server: ${status.serverHash?.slice(0, 18)}...`);
    }

    console.log();

    // Categorize
    results[status.status.toLowerCase()].push(status);
  }

  // Summary
  console.log('━'.repeat(55));
  console.log(`SUMMARY: ${results.finalized.length} finalized, ${results.missing.length} missing, ${results.mismatch.length} mismatch, ${results.skipped.length} skipped`);

  return results;
}

/**
 * Submit missing metadata to fork server.
 */
async function submitMissing(apiUrl) {
  console.log('\nSUBMITTING MISSING METADATA');
  console.log('━'.repeat(55));
  console.log(`Server: ${apiUrl}\n`);

  const files = findJsonFiles(FIXTURES_DIR);
  let submitted = 0;
  let failed = 0;

  for (const file of files) {
    const status = await checkFileStatus(apiUrl, file);

    if (status.status !== 'MISSING') continue;

    console.log(`Submitting: ${status.file}`);

    const response = await submitToForkServer(
      apiUrl,
      status.metadata,
      status.address,
      status.chainId
    );

    if (response.success) {
      console.log(`  → uid: ${response.uid.slice(0, 18)}...`);
      console.log(`  → hash: ${response.metadataHash.slice(0, 18)}...`);
      submitted++;
    } else {
      console.log(`  → ERROR: ${response.error}`);
      failed++;
    }

    console.log();
  }

  console.log('━'.repeat(55));
  console.log(`COMPLETE: ${submitted} submitted, ${failed} failed`);
}

/**
 * Export missing metadata as JSON.
 */
async function exportMissing(apiUrl) {
  const files = findJsonFiles(FIXTURES_DIR);
  const missing = [];

  for (const file of files) {
    const status = await checkFileStatus(apiUrl, file);

    if (status.status === 'MISSING') {
      missing.push({
        file: status.file,
        address: status.address,
        chainId: status.chainId,
        type: status.type
      });
    }
  }

  console.log(JSON.stringify(missing, null, 2));
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let apiUrl = DEFAULT_API_URL;
  let command = 'check';

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--api':
        apiUrl = args[++i];
        break;
      case '--check':
        command = 'check';
        break;
      case '--submit-missing':
        command = 'submit';
        break;
      case '--export-missing':
        command = 'export';
        break;
      case '--help':
      case '-h':
        console.log(`
Metadata Sync Script

Usage:
  node sync-metadata.js [options]

Options:
  --check           Check status of all local metadata (default)
  --submit-missing  Submit missing metadata to fork server
  --export-missing  Export missing as JSON (for batch submission)
  --api <url>       Fork server URL (default: ${DEFAULT_API_URL})
  --help, -h        Show this help

Examples:
  node sync-metadata.js --check
  node sync-metadata.js --submit-missing --api http://localhost:3000
  node sync-metadata.js --export-missing > missing.json
`);
        process.exit(0);
    }
  }

  // Verify server is reachable
  if (command !== 'export') {
    try {
      const response = await fetch(`${apiUrl}/admin/state`);
      if (!response.ok) {
        console.log(`Error: Fork server at ${apiUrl} returned ${response.status}`);
        process.exit(1);
      }
    } catch (e) {
      console.log(`Error: Cannot reach fork server at ${apiUrl}`);
      console.log(`Make sure the server is running: cd kaisign-state-reader && node src/index.js serve`);
      process.exit(1);
    }
  }

  // Execute command
  switch (command) {
    case 'check':
      await checkAll(apiUrl);
      break;
    case 'submit':
      await submitMissing(apiUrl);
      break;
    case 'export':
      await exportMissing(apiUrl);
      break;
  }
}

main().catch(err => {
  console.log('Error:', err.message);
  process.exit(1);
});
