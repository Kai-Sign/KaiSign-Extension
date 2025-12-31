/**
 * KaiSign Decoder Test Suite - Main Runner
 *
 * Runs all test suites and produces human-readable output.
 *
 * Usage:
 *   npm test
 *   node run-all-tests.js
 *   node run-all-tests.js --suite=uniswap
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TestHarness } from './lib/test-harness.js';
import { ResultFormatter } from './lib/result-formatter.js';
import { CONFIG } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const specificSuite = args.find(a => a.startsWith('--suite='))?.split('=')[1];
const verbose = args.includes('--verbose') || args.includes('-v');

/**
 * Test suite definitions
 */
const TEST_SUITES = [
  // Core decoder tests
  { name: 'core/decode.test.js', path: './suites/core/decode.test.js' },
  { name: 'core/recursive.test.js', path: './suites/core/recursive.test.js' },
  { name: 'core/advanced.test.js', path: './suites/core/advanced.test.js' },

  // Protocol tests
  { name: 'protocols/uniswap.test.js', path: './suites/protocols/uniswap.test.js' },
  { name: 'protocols/aave.test.js', path: './suites/protocols/aave.test.js' },
  { name: 'protocols/compound.test.js', path: './suites/protocols/compound.test.js' },
  { name: 'protocols/lido.test.js', path: './suites/protocols/lido.test.js' },
  { name: 'protocols/seaport.test.js', path: './suites/protocols/seaport.test.js' },
  { name: 'protocols/1inch.test.js', path: './suites/protocols/1inch.test.js' },
  { name: 'protocols/paraswap.test.js', path: './suites/protocols/paraswap.test.js' },
  { name: 'protocols/0x.test.js', path: './suites/protocols/0x.test.js' },
  { name: 'protocols/cow.test.js', path: './suites/protocols/cow.test.js' },

  // Account abstraction tests
  { name: 'aa/safe.test.js', path: './suites/aa/safe.test.js' },
  { name: 'aa/erc4337.test.js', path: './suites/aa/erc4337.test.js' },
  { name: 'aa/eip7702.test.js', path: './suites/aa/eip7702.test.js' }
];

/**
 * Load and run a test suite
 */
async function runSuite(harness, formatter, suiteDef) {
  const { name, path: suitePath } = suiteDef;

  // Check if suite file exists
  const fullPath = new URL(suitePath, import.meta.url);
  try {
    await fs.promises.access(fullPath.pathname);
  } catch {
    console.log(formatter.color(`[SKIP] ${name} - File not found`, 'yellow'));
    return { skipped: true, results: [] };
  }

  console.log(formatter.formatSuiteHeader(name));

  try {
    // Dynamic import of test suite
    const suiteModule = await import(suitePath);

    if (typeof suiteModule.runTests !== 'function') {
      console.log(formatter.color(`  [ERROR] Suite does not export runTests function`, 'red'));
      return { skipped: true, results: [] };
    }

    // Run the suite
    const results = await suiteModule.runTests(harness);

    // Print each result
    for (const result of results) {
      harness.printResult(result);
    }

    return { skipped: false, results };
  } catch (error) {
    console.log(formatter.color(`  [ERROR] ${error.message}`, 'red'));
    if (verbose) {
      console.log(error.stack);
    }
    return { skipped: true, results: [] };
  }
}

/**
 * Main entry point
 */
async function main() {
  const formatter = new ResultFormatter({ useColors: true });

  // Print header
  console.log(formatter.formatMainHeader());

  // Initialize harness
  const harness = new TestHarness({
    fixturesPath: path.resolve(__dirname, 'fixtures'),
    extensionPath: path.resolve(__dirname, '..'),
    defaultChainId: 1,
    verbose
  });

  console.log('[TestRunner] Initializing test harness...\n');

  try {
    await harness.initialize();
  } catch (error) {
    console.log(formatter.color(`[FATAL] Failed to initialize harness: ${error.message}`, 'red'));
    if (verbose) {
      console.log(error.stack);
    }
    process.exit(1);
  }

  // Filter suites if specific suite requested
  let suitesToRun = TEST_SUITES;
  if (specificSuite) {
    suitesToRun = TEST_SUITES.filter(s =>
      s.name.toLowerCase().includes(specificSuite.toLowerCase())
    );

    if (suitesToRun.length === 0) {
      console.log(formatter.color(`No suites matching '${specificSuite}'`, 'yellow'));
      console.log('Available suites:');
      for (const suite of TEST_SUITES) {
        console.log(`  - ${suite.name}`);
      }
      process.exit(1);
    }
  }

  // Run all suites
  let skippedSuites = 0;

  for (const suite of suitesToRun) {
    const { skipped } = await runSuite(harness, formatter, suite);
    if (skipped) {
      skippedSuites++;
    }
  }

  // Print summary
  harness.printSummary();

  // Additional info
  const stats = harness.getStats();
  if (skippedSuites > 0) {
    console.log(formatter.color(`\nNote: ${skippedSuites} suites were skipped (file not found or error)`, 'yellow'));
  }

  // Exit with appropriate code
  process.exit(stats.failed > 0 ? 1 : 0);
}

// Run main
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
