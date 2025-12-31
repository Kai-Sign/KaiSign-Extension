/**
 * Test Harness
 *
 * Main test execution framework that orchestrates decoding tests
 * and validates results against expected outputs.
 */

import { loadDecoderModules, calculateSelector } from './node-adapter.js';
import { LocalMetadataService } from './local-metadata-service.js';
import { ResultFormatter } from './result-formatter.js';

export class TestHarness {
  constructor(config = {}) {
    this.config = {
      fixturesPath: config.fixturesPath || './fixtures',
      extensionPath: config.extensionPath || '..',
      defaultChainId: config.defaultChainId || 1,
      verbose: config.verbose || false
    };

    this.metadataService = new LocalMetadataService(this.config.fixturesPath);
    this.formatter = new ResultFormatter();
    this.decoders = null;
    this.initialized = false;

    // Test statistics
    this.stats = {
      passed: 0,
      failed: 0,
      skipped: 0,
      totalDuration: 0
    };

    // All test results
    this.allResults = [];
  }

  /**
   * Initialize the harness
   */
  async initialize() {
    if (this.initialized) return;

    console.log('[TestHarness] Initializing...');

    // Initialize metadata service
    await this.metadataService.initialize();

    // Load decoder modules
    this.decoders = await loadDecoderModules(this.metadataService);

    this.initialized = true;
    console.log('[TestHarness] Ready');
  }

  /**
   * Run a single test case
   * @param {Object} testCase - Test case definition
   * @returns {Object} - Test result
   */
  async runTest(testCase) {
    const {
      name,
      calldata,
      contractAddress,
      chainId = this.config.defaultChainId,
      expected = {}
    } = testCase;

    const startTime = Date.now();

    try {
      // Validate inputs
      if (!calldata || calldata.length < 10) {
        return this.createResult(name, false, null, expected, 'Invalid calldata', Date.now() - startTime);
      }

      if (!contractAddress) {
        return this.createResult(name, false, null, expected, 'Missing contract address', Date.now() - startTime);
      }

      // Decode the calldata
      const result = await this.decoders.decodeCalldata(calldata, contractAddress, chainId);
      const duration = Date.now() - startTime;

      // Validate result against expected
      const passed = this.validateResult(result, expected);

      return this.createResult(name, passed, result, expected, null, duration);
    } catch (error) {
      const duration = Date.now() - startTime;
      return this.createResult(name, false, null, expected, error.message, duration);
    }
  }

  /**
   * Run recursive decode test
   * @param {Object} testCase - Test case with nested calldata
   * @returns {Object} - Test result with nested intents
   */
  async runRecursiveTest(testCase) {
    const {
      name,
      calldata,
      contractAddress,
      chainId = this.config.defaultChainId,
      expected = {}
    } = testCase;

    const startTime = Date.now();

    try {
      if (!this.decoders.recursiveCalldataDecoder) {
        return this.createResult(name, false, null, expected, 'Recursive decoder not available', 0);
      }

      const result = await this.decoders.decodeCalldataRecursive(calldata, contractAddress, chainId);
      const duration = Date.now() - startTime;

      const passed = this.validateRecursiveResult(result, expected);

      return this.createResult(name, passed, result, expected, null, duration);
    } catch (error) {
      const duration = Date.now() - startTime;
      return this.createResult(name, false, null, expected, error.message, duration);
    }
  }

  /**
   * Run advanced transaction decode test (EIP-7702, EIP-1559)
   * @param {Object} testCase - Test case with full transaction data
   * @returns {Object} - Test result
   */
  async runAdvancedTest(testCase) {
    const {
      name,
      rawTx,
      contractAddress,
      chainId = this.config.defaultChainId,
      expected = {}
    } = testCase;

    const startTime = Date.now();

    try {
      if (!this.decoders.advancedTransactionDecoder) {
        return this.createResult(name, false, null, expected, 'Advanced decoder not available', 0);
      }

      const result = await this.decoders.advancedTransactionDecoder.decodeTransaction(rawTx, contractAddress, chainId);
      const duration = Date.now() - startTime;

      const passed = this.validateAdvancedResult(result, expected);

      return this.createResult(name, passed, result, expected, null, duration);
    } catch (error) {
      const duration = Date.now() - startTime;
      return this.createResult(name, false, null, expected, error.message, duration);
    }
  }

  /**
   * Create a test result object
   */
  createResult(name, passed, result, expected, error, duration) {
    const testResult = {
      name,
      passed,
      duration,
      result,
      expected,
      error,
      skipped: false
    };

    // Update stats
    if (passed) {
      this.stats.passed++;
    } else {
      this.stats.failed++;
    }
    this.stats.totalDuration += duration;

    // Store result
    this.allResults.push(testResult);

    return testResult;
  }

  /**
   * Validate decode result against expected values
   */
  validateResult(result, expected) {
    // Check if should succeed
    if (expected.shouldSucceed !== false && !result.success) {
      return false;
    }
    if (expected.shouldSucceed === false && result.success) {
      return false;
    }

    // Check selector
    if (expected.selector && result.selector !== expected.selector) {
      return false;
    }

    // Check function name
    if (expected.functionName && result.functionName !== expected.functionName) {
      return false;
    }

    // Check function signature
    if (expected.functionSignature && result.function !== expected.functionSignature) {
      return false;
    }

    // Check intent contains
    if (expected.intentContains && !result.intent?.includes(expected.intentContains)) {
      return false;
    }

    // Check specific parameters
    if (expected.params) {
      for (const [key, value] of Object.entries(expected.params)) {
        if (result.params?.[key]?.toString() !== value.toString()) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Validate recursive decode result
   */
  validateRecursiveResult(result, expected) {
    if (!this.validateResult(result, expected)) {
      return false;
    }

    // Check nested intents count
    if (expected.nestedIntentCount !== undefined) {
      if (result.nestedIntents?.length !== expected.nestedIntentCount) {
        return false;
      }
    }

    // Check if specific nested intents exist
    if (expected.nestedIntentContains) {
      for (const intentPart of expected.nestedIntentContains) {
        const found = result.nestedIntents?.some(intent => intent.includes(intentPart));
        if (!found) return false;
      }
    }

    return true;
  }

  /**
   * Validate advanced transaction result
   */
  validateAdvancedResult(result, expected) {
    // Check transaction type
    if (expected.txType && result.txType !== expected.txType) {
      return false;
    }

    // Check delegations for EIP-7702
    if (expected.hasDelegations && (!result.delegations || result.delegations.length === 0)) {
      return false;
    }

    // Check authorization list
    if (expected.authorizationCount !== undefined) {
      if (result.authorizationList?.length !== expected.authorizationCount) {
        return false;
      }
    }

    return this.validateResult(result, expected);
  }

  /**
   * Calculate function selector
   */
  calculateSelector(signature) {
    return calculateSelector(signature);
  }

  /**
   * Add metadata to service (for testing)
   */
  addMetadata(address, metadata) {
    this.metadataService.addMetadata(address, metadata);
  }

  /**
   * Get test statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Get all results
   */
  getAllResults() {
    return this.allResults;
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = { passed: 0, failed: 0, skipped: 0, totalDuration: 0 };
    this.allResults = [];
  }

  /**
   * Print formatted result
   */
  printResult(result) {
    console.log(this.formatter.formatTestResult(result));
  }

  /**
   * Print summary
   */
  printSummary() {
    console.log(this.formatter.formatSummary(this.stats));
  }
}

export default TestHarness;
