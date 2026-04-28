/**
 * Result Formatter
 *
 * Formats test results for human-readable console output
 * with colors, structured output, and summary statistics.
 */

// ANSI color codes
const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',

  // Text colors
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',

  // Background colors
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m'
};

// Uniswap Universal Router command opcodes
const UNISWAP_COMMANDS = {
  0x00: 'V3_SWAP_EXACT_IN',
  0x01: 'V3_SWAP_EXACT_OUT',
  0x02: 'PERMIT2_TRANSFER_FROM',
  0x03: 'PERMIT2_PERMIT_BATCH',
  0x04: 'SWEEP',
  0x05: 'TRANSFER',
  0x06: 'PAY_PORTION',
  0x08: 'V2_SWAP_EXACT_IN',
  0x09: 'V2_SWAP_EXACT_OUT',
  0x0a: 'PERMIT2_PERMIT',
  0x0b: 'WRAP_ETH',
  0x0c: 'UNWRAP_WETH',
  0x0d: 'PERMIT2_TRANSFER_FROM_BATCH',
  0x0e: 'BALANCE_CHECK_ERC20',
  0x10: 'SEAPORT_V1_5',
  0x11: 'LOOKS_RARE_V2',
  0x12: 'NFTX',
  0x13: 'CRYPTOPUNKS',
  0x14: 'OWNER_CHECK_721',
  0x15: 'OWNER_CHECK_1155',
  0x16: 'SWEEP_ERC721',
  0x17: 'X2Y2_721',
  0x18: 'SUDOSWAP',
  0x19: 'NFT20',
  0x1a: 'X2Y2_1155',
  0x1b: 'FOUNDATION',
  0x1c: 'SWEEP_ERC1155',
  0x1d: 'ELEMENT_MARKET',
  0x1e: 'SEAPORT_V1_4',
  0x1f: 'EXECUTE_SUB_PLAN',
  0x20: 'APPROVE_ERC20'
};

/**
 * Decode Uniswap Universal Router commands from hex bytes
 */
function decodeUniswapCommands(hexBytes) {
  if (!hexBytes || !hexBytes.startsWith('0x')) return null;

  const bytes = hexBytes.slice(2); // Remove 0x
  const commands = [];

  for (let i = 0; i < bytes.length; i += 2) {
    const byte = parseInt(bytes.slice(i, i + 2), 16);
    if (isNaN(byte)) break;
    const name = UNISWAP_COMMANDS[byte] || `UNKNOWN_0x${byte.toString(16).padStart(2, '0')}`;
    commands.push(name);
  }

  return commands.length > 0 ? commands : null;
}

// 0x Protocol transformer nonces
const ZEROX_TRANSFORMERS = {
  1: 'WethTransformer',
  2: 'PayTakerTransformer',
  3: 'FillQuoteTransformer',
  4: 'AffiliateFeeTransformer',
  5: 'PositiveSlippageFeeTransformer'
};

/**
 * Decode 0x transformations array
 */
function decode0xTransformations(transformations) {
  if (!Array.isArray(transformations)) return null;

  return transformations.map(t => {
    const nonce = t.deploymentNonce?._hex ? parseInt(t.deploymentNonce._hex, 16) : t.deploymentNonce;
    const name = ZEROX_TRANSFORMERS[nonce] || `Transformer_${nonce}`;
    return name;
  });
}

/**
 * Decode 1inch pools array (high bit = direction, rest = pool)
 */
function decode1inchPools(pools) {
  if (!Array.isArray(pools)) return null;

  return pools.map(p => {
    const hex = p._hex || p.toString(16);
    const value = BigInt(hex);
    const direction = (value >> 255n) === 1n ? 'reverse' : 'forward';
    return `Pool(${direction})`;
  });
}

/**
 * Known DEX addresses for ParaSwap callees
 */
const KNOWN_DEXS = {
  '0x7a250d5630b4cf539739df2c5dacb4c659f2488d': 'UniswapV2Router',
  '0xe592427a0aece92de3edee1f18e0157c05861564': 'UniswapV3Router',
  '0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f': 'SushiSwapRouter',
  '0xdef171fe48cf0115b1d80b88dc8eab59176fee57': 'ParaSwapPool',
  '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7': 'Curve3Pool',
  '0x99a58482bd75cbab83b27ec03ca68ff489b5788f': 'CurveTriCrypto'
};

/**
 * Decode ParaSwap callees to DEX names
 */
function decodeParaswapCallees(callees) {
  if (!Array.isArray(callees)) return null;

  return callees.map(addr => {
    const lower = addr.toLowerCase();
    return KNOWN_DEXS[lower] || `DEX(${addr.slice(0, 10)}...)`;
  });
}

export class ResultFormatter {
  constructor(options = {}) {
    this.useColors = options.useColors !== false;
    this.showRawValues = options.showRawValues || false;
    this.maxParamLength = options.maxParamLength || 80;
  }

  /**
   * Format a single test result
   */
  formatTestResult(result) {
    const { name, passed, duration, result: decodedResult, expected, error, skipped, metadataSync } = result;

    let output = '';

    // Status indicator
    if (skipped) {
      output += this.color(`[SKIP]`, 'yellow', 'bold');
    } else if (passed) {
      output += this.color(`[PASS]`, 'green', 'bold');
    } else {
      output += this.color(`[FAIL]`, 'red', 'bold');
    }

    // Test name and duration
    output += ` ${name} ${this.color(`(${duration}ms)`, 'dim')}\n`;

    // Show decoded result details
    if (decodedResult) {
      output += this.formatDecodedResult(decodedResult);
    }

    if (metadataSync?.note) {
      const color =
        metadataSync.status === 'in-sync' ? 'green' :
        metadataSync.status === 'drift' ? 'yellow' :
        metadataSync.status === 'backend-missing' ? 'red' :
        metadataSync.status === 'error' ? 'red' :
        'dim';
      output += `  ${this.color('Fixture Sync:', 'cyan')} ${this.color(metadataSync.note, color)}\n`;
    }

    // Show error - different formatting for expected vs unexpected errors
    if (error) {
      if (passed && expected?.shouldSucceed === false) {
        // Test passed by correctly rejecting invalid input - show as expected behavior
        output += `  ${this.color('Correctly rejected:', 'dim')} ${error}\n`;
      } else if (!passed) {
        // Actual failure - show as error
        output += `  ${this.color('Error:', 'red')} ${error}\n`;
      }
    }

    // Show expected values if failed
    if (!passed && expected && Object.keys(expected).length > 0) {
      output += this.formatExpected(expected, decodedResult);
    }

    return output;
  }

  /**
   * Format decoded result details
   */
  formatDecodedResult(result) {
    let output = '';

    // Verification badge (matches popup logic)
    const verification = result.metadata?._verification || result._verification;
    if (verification) {
      if (verification.verified) {
        output += `  ${this.color('[Verified]', 'green')} On-chain attestation found\n`;
      } else if (verification.source === 'mismatch') {
        output += `  ${this.color('[Mismatch]', 'red')} ${verification.details || 'Hash mismatch'}\n`;
      } else {
        output += `  ${this.color('[Unverified]', 'dim')} ${verification.details || 'No attestation'}\n`;
      }
    }

    // Selector
    if (result.selector) {
      output += `  ${this.color('Selector:', 'cyan')} ${result.selector}\n`;
    }

    // Function name/signature
    if (result.function) {
      output += `  ${this.color('Function:', 'cyan')} ${result.function}\n`;
    } else if (result.functionName) {
      output += `  ${this.color('Function:', 'cyan')} ${result.functionName}\n`;
    }

    // Intent
    if (result.intent) {
      output += `  ${this.color('Intent:', 'cyan')} ${this.color(result.intent, 'bold')}\n`;
    }

    // Formatted parameters
    if (result.formatted && Object.keys(result.formatted).length > 0) {
      output += `  ${this.color('Parameters:', 'cyan')}\n`;
      for (const [key, value] of Object.entries(result.formatted)) {
        let displayValue = this.truncate(value.value || value, this.maxParamLength);
        const rawValue = value.value || value;
        const label = value.label || key;
        const labelLower = label.toLowerCase();
        const keyLower = key.toLowerCase();

        // Decode Uniswap commands
        if ((labelLower.includes('command') || keyLower === 'commands') &&
            typeof displayValue === 'string' && displayValue.startsWith('0x')) {
          const decoded = decodeUniswapCommands(displayValue);
          if (decoded) {
            displayValue = `${displayValue} → [${decoded.join(', ')}]`;
          }
        }

        // Decode 0x transformations (only for objects with deploymentNonce)
        if ((labelLower.includes('route') || keyLower === 'transformations') &&
            typeof rawValue === 'string' && rawValue.startsWith('[')) {
          try {
            const parsed = JSON.parse(rawValue);
            if (parsed.length > 0 && parsed[0]?.deploymentNonce !== undefined) {
              const decoded = decode0xTransformations(parsed);
              if (decoded) {
                displayValue = `[${decoded.join(' → ')}]`;
              }
            }
          } catch {}
        }

        // Decode 1inch pools (only for 1inch-style BigNumber arrays, not address arrays)
        if ((labelLower.includes('route') || keyLower === 'pools') &&
            typeof rawValue === 'string' && rawValue.startsWith('[')) {
          try {
            const parsed = JSON.parse(rawValue);
            // Only decode as 1inch pools if elements have _hex property (BigNumber format)
            if (parsed.length > 0 && parsed[0]?._hex) {
              const decoded = decode1inchPools(parsed);
              if (decoded) {
                displayValue = `[${decoded.join(' → ')}]`;
              }
            }
          } catch {}
        }

        // Decode ParaSwap callees
        if ((labelLower.includes('dex route') || keyLower === 'callees') &&
            typeof rawValue === 'string' && rawValue.startsWith('[')) {
          try {
            const parsed = JSON.parse(rawValue);
            const decoded = decodeParaswapCallees(parsed);
            if (decoded) {
              displayValue = `[${decoded.join(' → ')}]`;
            }
          } catch {}
        }

        output += `    - ${label}: ${displayValue}\n`;
      }
    }

    // Nested intents (for recursive decoding)
    if (result.nestedIntents && result.nestedIntents.length > 0) {
      output += `  ${this.color('Nested Operations:', 'magenta')}\n`;
      for (const intent of result.nestedIntents) {
        output += `    ${this.color('->', 'dim')} ${intent}\n`;
      }
    }

    // Transaction type for advanced decoding
    if (result.txType) {
      output += `  ${this.color('TX Type:', 'cyan')} ${result.txType}\n`;
    }

    // Delegations for EIP-7702
    if (result.delegations && result.delegations.length > 0) {
      output += `  ${this.color('Delegations:', 'magenta')}\n`;
      for (const delegation of result.delegations) {
        output += `    ${this.color('->', 'dim')} ${delegation.delegate || delegation.address}\n`;
      }
    }

    return output;
  }

  /**
   * Format expected vs actual for failed tests
   */
  formatExpected(expected, actual) {
    let output = `  ${this.color('Expected:', 'yellow')}\n`;

    for (const [key, value] of Object.entries(expected)) {
      if (key === 'shouldSucceed') continue;

      const actualValue = this.getActualValue(actual, key);
      const match = this.valuesMatch(value, actualValue);

      output += `    ${key}: ${value}`;
      if (!match) {
        output += ` ${this.color(`(got: ${actualValue})`, 'red')}`;
      }
      output += '\n';
    }

    return output;
  }

  /**
   * Get actual value from result for comparison
   */
  getActualValue(result, key) {
    if (!result) return 'null';

    switch (key) {
      case 'selector':
        // For advanced tests, selector is in mainCall
        return result.selector || result.mainCall?.selector;
      case 'functionName':
        // For advanced tests, functionName is in mainCall
        return result.functionName || result.mainCall?.functionName;
      case 'functionSignature':
        return result.function || result.mainCall?.function;
      case 'intentContains':
        return result.intent;
      case 'txType':
        return result.txType;
      case 'nestedIntentCount':
        return result.nestedIntents?.length;
      case 'nestedIntentContains':
        // Show aggregated intent and nested intents for debugging
        const nested = result.nestedIntents || result.allIntents || [];
        const agg = result.aggregatedIntent || result.intent || '';
        return nested.length > 0 ? nested.join(', ') : agg;
      default:
        return result[key] || result.params?.[key];
    }
  }

  /**
   * Check if values match
   */
  valuesMatch(expected, actual) {
    if (expected === actual) return true;
    if (typeof expected === 'string' && typeof actual === 'string') {
      // For 'intentContains', check if actual includes expected
      return actual.includes(expected);
    }
    return false;
  }

  /**
   * Format test summary
   */
  formatSummary(stats) {
    const { passed, failed, skipped, totalDuration } = stats;
    const total = passed + failed + skipped;
    const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : 0;

    const line = '='.repeat(80);
    let output = `\n${line}\n`;
    output += `${this.color('TEST SUMMARY', 'bold')}\n`;
    output += `${line}\n`;
    output += `Total Tests: ${total}\n`;
    output += `${this.color('Passed:', 'green')} ${passed} (${passRate}%)\n`;
    output += `${this.color('Failed:', 'red')} ${failed}\n`;

    if (skipped > 0) {
      output += `${this.color('Skipped:', 'yellow')} ${skipped}\n`;
    }

    output += `Duration: ${totalDuration}ms\n`;
    output += `${line}\n`;

    // Overall status
    if (failed === 0) {
      output += this.color('\n  ALL TESTS PASSED  \n', 'green', 'bold');
    } else {
      output += this.color(`\n  ${failed} TESTS FAILED  \n`, 'red', 'bold');
    }

    return output;
  }

  /**
   * Format suite header
   */
  formatSuiteHeader(suiteName) {
    const line = '-'.repeat(40);
    return `\n${this.color(`Running: ${suiteName}`, 'bold')}\n${line}\n`;
  }

  /**
   * Format main header
   */
  formatMainHeader() {
    const line = '='.repeat(80);
    return `\n${line}\n${this.color('KAISIGN DECODER TEST SUITE', 'bold', 'cyan')}\n${line}\n`;
  }

  /**
   * Apply color to text
   */
  color(text, ...styles) {
    if (!this.useColors) return text;

    let prefix = '';
    for (const style of styles) {
      if (COLORS[style]) {
        prefix += COLORS[style];
      }
    }

    if (prefix) {
      return `${prefix}${text}${COLORS.reset}`;
    }
    return text;
  }

  /**
   * Truncate long strings
   */
  truncate(str, maxLength) {
    if (typeof str !== 'string') {
      str = String(str);
    }
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength - 3) + '...';
  }
}

export default ResultFormatter;
