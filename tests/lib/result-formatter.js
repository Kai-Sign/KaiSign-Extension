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
    const { name, passed, duration, result: decodedResult, expected, error, skipped } = result;

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

    // Show error if failed
    if (error) {
      output += `  ${this.color('Error:', 'red')} ${error}\n`;
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
        const displayValue = this.truncate(value.value || value, this.maxParamLength);
        const label = value.label || key;
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
        return result.selector;
      case 'functionName':
        return result.functionName;
      case 'functionSignature':
        return result.function;
      case 'intentContains':
        return result.intent;
      case 'txType':
        return result.txType;
      case 'nestedIntentCount':
        return result.nestedIntents?.length;
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
