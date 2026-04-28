/**
 * Test Harness
 *
 * Main test execution framework that orchestrates decoding tests
 * and validates results against expected outputs.
 */

import { loadDecoderModules, calculateSelector } from './node-adapter.js';
import { LocalMetadataService } from './local-metadata-service.js';
import { RemoteMetadataService } from './remote-metadata-service.js';
import { ResultFormatter } from './result-formatter.js';

export class TestHarness {
  constructor(config = {}) {
    this.config = {
      fixturesPath: config.fixturesPath || './fixtures',
      extensionPath: config.extensionPath || '..',
      defaultChainId: config.defaultChainId || 1,
      verbose: config.verbose || false,
      useRemoteApi: config.useRemoteApi || false
    };

    // Choose metadata service based on config
    this.metadataService = this.config.useRemoteApi
      ? new RemoteMetadataService()
      : new LocalMetadataService(this.config.fixturesPath);
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
        // If test expects failure, this is correct behavior
        const passed = expected.shouldSucceed === false;
        return this.createResult(name, passed, { success: false }, expected, 'Invalid calldata', Date.now() - startTime);
      }

      if (!contractAddress) {
        const passed = expected.shouldSucceed === false;
        return this.createResult(name, passed, { success: false }, expected, 'Missing contract address', Date.now() - startTime);
      }

      // Decode the calldata
      const result = await this.decoders.decodeCalldata(calldata, contractAddress, chainId);
      const duration = Date.now() - startTime;
      const metadataSync = await this.getMetadataSyncNote(contractAddress, chainId);

      // Validate result against expected
      const passed = this.validateResult(result, expected);

      return this.createResult(name, passed, result, expected, null, duration, metadataSync);
    } catch (error) {
      const duration = Date.now() - startTime;
      const metadataSync = await this.getMetadataSyncNote(contractAddress, chainId);
      return this.createResult(name, false, null, expected, error.message, duration, metadataSync);
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
      const metadataSync = await this.getMetadataSyncNote(contractAddress, chainId);

      const passed = this.validateRecursiveResult(result, expected);

      return this.createResult(name, passed, result, expected, null, duration, metadataSync);
    } catch (error) {
      const duration = Date.now() - startTime;
      const metadataSync = await this.getMetadataSyncNote(contractAddress, chainId);
      return this.createResult(name, false, null, expected, error.message, duration, metadataSync);
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
      const metadataSync = await this.getMetadataSyncNote(contractAddress, chainId);

      const passed = this.validateAdvancedResult(result, expected);

      return this.createResult(name, passed, result, expected, null, duration, metadataSync);
    } catch (error) {
      const duration = Date.now() - startTime;
      const metadataSync = await this.getMetadataSyncNote(contractAddress, chainId);
      return this.createResult(name, false, null, expected, error.message, duration, metadataSync);
    }
  }

  /**
   * Create a test result object
   */
  createResult(name, passed, result, expected, error, duration, metadataSync = null) {
    const testResult = {
      name,
      passed,
      duration,
      result,
      expected,
      error,
      metadataSync,
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

  async getMetadataSyncNote(contractAddress, chainId) {
    if (typeof this.metadataService?.getFixtureSyncStatus !== 'function') {
      return null;
    }
    try {
      return await this.metadataService.getFixtureSyncStatus(contractAddress, chainId);
    } catch (error) {
      return {
        status: 'error',
        note: `sync check error (${error.message})`
      };
    }
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

    // Check exact intent match
    if (expected.intent && result.intent !== expected.intent) {
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

    // NEW: Intent must NOT contain (negative validation)
    if (expected.intentDoesNotContain) {
      if (result.intent?.includes(expected.intentDoesNotContain)) {
        console.error(`Intent should not contain "${expected.intentDoesNotContain}"`);
        return false;
      }
    }

    // intentNotContains - alias for intentDoesNotContain
    if (expected.intentNotContains) {
      if (result.intent?.includes(expected.intentNotContains)) {
        console.error(`Intent should not contain "${expected.intentNotContains}" but got: ${result.intent}`);
        return false;
      }
    }

    // intentMatches - regex validation
    if (expected.intentMatches) {
      const regex = expected.intentMatches instanceof RegExp
        ? expected.intentMatches
        : new RegExp(expected.intentMatches);
      if (!regex.test(result.intent || '')) {
        console.error(`Intent should match ${regex} but got: ${result.intent}`);
        return false;
      }
    }

    if (expected.unknownSummary) {
      if (!result.unknownSummary) {
        console.error('Expected unknownSummary object');
        return false;
      }

      if (expected.unknownSummary.selector && result.unknownSummary.selector !== expected.unknownSummary.selector) {
        console.error(`unknownSummary selector mismatch: expected ${expected.unknownSummary.selector}, got ${result.unknownSummary.selector}`);
        return false;
      }

      if (expected.unknownSummary.addressCount !== undefined &&
          result.unknownSummary.addressCount !== expected.unknownSummary.addressCount) {
        console.error(`unknownSummary addressCount mismatch: expected ${expected.unknownSummary.addressCount}, got ${result.unknownSummary.addressCount}`);
        return false;
      }

      if (expected.unknownSummary.addressCountMin !== undefined &&
          (result.unknownSummary.addressCount || 0) < expected.unknownSummary.addressCountMin) {
        console.error(`unknownSummary addressCount too small: expected at least ${expected.unknownSummary.addressCountMin}, got ${result.unknownSummary.addressCount}`);
        return false;
      }

      if (expected.unknownSummary.tokenHintsContain) {
        for (const tokenHint of expected.unknownSummary.tokenHintsContain) {
          if (!result.unknownSummary.tokenHints?.includes(tokenHint)) {
            console.error(`unknownSummary missing token hint: ${tokenHint}`);
            return false;
          }
        }
      }

      if (expected.unknownSummary.linesContain) {
        for (const snippet of expected.unknownSummary.linesContain) {
          const found = result.unknownSummary.lines?.some(line => line.includes(snippet));
          if (!found) {
            console.error(`unknownSummary missing line containing: ${snippet}`);
            return false;
          }
        }
      }
    }

    // NEW: Decoded commands validation (Uniswap command registry)
    if (expected.decodedCommands) {
      if (!Array.isArray(result.decodedCommands)) {
        console.error('Expected decodedCommands array, got:', typeof result.decodedCommands);
        return false;
      }
      if (result.decodedCommands.length !== expected.decodedCommands.length) {
        console.error(`Command count: expected ${expected.decodedCommands.length}, got ${result.decodedCommands.length}`);
        return false;
      }
      for (let i = 0; i < expected.decodedCommands.length; i++) {
        const exp = expected.decodedCommands[i];
        const act = result.decodedCommands[i];
        if (exp.command && act.command !== exp.command) {
          console.error(`Command ${i} opcode mismatch: expected ${exp.command}, got ${act.command}`);
          return false;
        }
        if (exp.name && act.name !== exp.name) {
          console.error(`Command ${i} name mismatch: expected ${exp.name}, got ${act.name}`);
          return false;
        }
        if (exp.intent && act.intent !== exp.intent) {
          console.error(`Command ${i} intent mismatch: expected "${exp.intent}", got "${act.intent}"`);
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

    // Check nested intent contains (important for multicall/handleOps)
    if (expected.nestedIntentContains) {
      const nestedIntents = result.nestedIntents || result.allIntents || [];
      const aggregatedIntent = result.aggregatedIntent || result.intent || '';

      for (const intentPart of expected.nestedIntentContains) {
        const foundInNested = nestedIntents.some(intent =>
          intent && intent.toString().includes(intentPart)
        );
        const foundInAggregated = aggregatedIntent.includes(intentPart);

        if (!foundInNested && !foundInAggregated) {
          return false;
        }
      }
    }

    // Check selector from mainCall if expected (advanced decoder stores it there)
    if (expected.selector) {
      const mainSelector = result.mainCall?.selector || result.selector;
      if (mainSelector !== expected.selector) {
        return false;
      }
    }

    // Check functionName from mainCall if expected
    if (expected.functionName) {
      const mainFunctionName = result.mainCall?.functionName || result.functionName;
      if (mainFunctionName !== expected.functionName) {
        return false;
      }
    }

    // Check shouldSucceed
    if (expected.shouldSucceed !== undefined) {
      if (expected.shouldSucceed !== false && !result.success) {
        return false;
      }
      if (expected.shouldSucceed === false && result.success) {
        return false;
      }
    }

    // NEW: Enhanced nested intents validation (array of exact strings or objects)
    if (expected.nestedIntents && Array.isArray(expected.nestedIntents)) {
      const actualNested = result.nestedIntents || result.allIntents || [];
      if (actualNested.length !== expected.nestedIntents.length) {
        console.error(`Nested count: expected ${expected.nestedIntents.length}, got ${actualNested.length}`);
        return false;
      }

      for (let i = 0; i < expected.nestedIntents.length; i++) {
        const exp = expected.nestedIntents[i];
        const act = actualNested[i];

        if (typeof exp === 'string') {
          // Exact string match or substring
          const actStr = typeof act === 'string' ? act : act?.intent || act?.toString() || '';
          if (actStr !== exp && !actStr.includes(exp)) {
            console.error(`Nested intent ${i}: expected "${exp}", got "${actStr}"`);
            return false;
          }
        } else {
          // Object validation
          if (exp.intent && act.intent !== exp.intent) {
            console.error(`Nested intent ${i} text mismatch`);
            return false;
          }
          if (exp.functionName && act.functionName !== exp.functionName) {
            console.error(`Nested intent ${i} function mismatch`);
            return false;
          }
        }
      }
    }

    return true;
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
  addMetadata(address, metadata, chainId = 1) {
    this.metadataService.addMetadata(address, metadata, chainId);
  }

  addTokenMetadata(address, tokenInfo, chainId = 1) {
    this.metadataService.addTokenMetadata(address, tokenInfo, chainId);
  }

  /**
   * Run EIP-712 typed data signature test
   * @param {Object} testConfig - Test configuration
   * @returns {Object} - Test result
   */
  async runEIP712Test(testConfig) {
    const { name, typedData, expected = {} } = testConfig;
    const startTime = Date.now();

    try {
      const verifyingContract = typedData.domain?.verifyingContract?.toLowerCase();
      const primaryType = typedData.primaryType;
      const chainId = typedData.domain?.chainId || 1;

      if (!verifyingContract) {
        return this.createResult(name, false, null, expected, 'Missing verifyingContract in domain', Date.now() - startTime);
      }

      if (!primaryType) {
        return this.createResult(name, false, null, expected, 'Missing primaryType', Date.now() - startTime);
      }

      // Get EIP-712 metadata from service
      const metadata = await this.metadataService.getEIP712Metadata(verifyingContract, primaryType);
      
      // Format display if decoder is available
      let formattedDisplay = null;
      if (metadata?.matchedFormat && globalThis.window.formatEIP712Display) {
        try {
          formattedDisplay = await globalThis.window.formatEIP712Display(typedData, metadata);
        } catch (e) {
          console.warn('[TestHarness] formatEIP712Display failed:', e.message);
        }
      }
      
      const duration = Date.now() - startTime;

      const result = {
        success: !!metadata?.matchedFormat,
        primaryType,
        verifyingContract,
        chainId,
        metadata: !!metadata,
        matchedFormat: metadata?.matchedFormat || null,
        intent: formattedDisplay?.intent || metadata?.matchedFormat?.intent || null,
        fields: formattedDisplay?.fields || metadata?.matchedFormat?.fields || [],
        _verification: metadata?._verification || null,
        formattedDisplay: formattedDisplay
      };

      // Validate expectations
      let passed = true;
      let error = null;

      if (expected.shouldSucceed !== false && !result.matchedFormat) {
        passed = false;
        error = `No EIP-712 format found for ${primaryType}`;
      } else if (expected.shouldSucceed === false && result.matchedFormat) {
        passed = false;
        error = `Expected failure but format was found`;
      }

      if (passed && expected.primaryType && result.primaryType !== expected.primaryType) {
        passed = false;
        error = `primaryType mismatch: expected ${expected.primaryType}, got ${result.primaryType}`;
      }

      if (passed && expected.intentContains) {
        const intent = result.intent || '';
        if (!intent.includes(expected.intentContains)) {
          passed = false;
          error = `Intent "${intent}" does not contain "${expected.intentContains}"`;
        }
      }

      if (passed && expected.hasFields) {
        const fieldPaths = result.fields.map(f => f.path);
        for (const expectedField of expected.hasFields) {
          if (!fieldPaths.includes(expectedField)) {
            passed = false;
            error = `Missing expected field: ${expectedField}`;
            break;
          }
        }
      }

      return this.createResult(name, passed, result, expected, error, duration);
    } catch (err) {
      const duration = Date.now() - startTime;
      return this.createResult(name, false, null, expected, err.message, duration);
    }
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
