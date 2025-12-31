#!/usr/bin/env node
/**
 * Extract metadata from test files and save as JSON
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testFiles = [
  'suites/aa/safe.test.js',
  'suites/core/decode.test.js',
  'suites/protocols/0x.test.js',
  'suites/protocols/1inch.test.js',
  'suites/protocols/aave.test.js',
  'suites/protocols/compound.test.js',
  'suites/protocols/cow.test.js',
  'suites/protocols/seaport.test.js',
  'suites/protocols/uniswap.test.js'
];

// Read each test file and extract metadata
for (const testFile of testFiles) {
  const fullPath = path.join(__dirname, testFile);
  const content = fs.readFileSync(fullPath, 'utf8');

  console.log(`\n=== ${testFile} ===`);

  // Find all harness.addMetadata calls
  const metadataRegex = /harness\.addMetadata\(([^,]+),\s*(\{[\s\S]*?\n\s*\})\);/g;
  let match;
  let index = 0;

  while ((match = metadataRegex.exec(content)) !== null) {
    const addressVar = match[1].trim();
    const metadataStr = match[2];

    try {
      // Try to extract contract name from metadata
      const nameMatch = metadataStr.match(/name:\s*['"]([^'"]+)['"]/);
      const name = nameMatch ? nameMatch[1] : `contract-${index}`;

      console.log(`  Found: ${name} (${addressVar})`);
      console.log(`  Metadata length: ${metadataStr.length} chars`);

      index++;
    } catch (e) {
      console.error(`  Error parsing metadata: ${e.message}`);
    }
  }
}

console.log('\n\nDone scanning files.');
