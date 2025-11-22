/**
 * EIP-7702 Transaction Detection Logic
 * Adapted from working MetaMask Snap code
 */

class EIP7702Detector {
  constructor() {
    this.transactionCache = new Map();
  }

  /**
   * Detect if a transaction is EIP-7702
   * @param {Object} transaction - Transaction object
   * @returns {boolean} - True if EIP-7702 transaction
   */
  isEIP7702Transaction(transaction) {
    if (!transaction) return false;
    
    const isEIP7702 = transaction.type === '0x4' || 
                     transaction.type === '0x04' || 
                     transaction.type === 4 ||
                     transaction.authorizationList;
    
    console.log('[KaiSign-EIP7702] Transaction detection:', {
      type: transaction.type,
      hasAuthList: !!transaction.authorizationList,
      isEIP7702: isEIP7702,
      transaction: transaction
    });
    
    return isEIP7702;
  }

  /**
   * Parse authorization list from EIP-7702 transaction
   * @param {Object} transaction - EIP-7702 transaction
   * @returns {Array} - Parsed authorization entries
   */
  parseAuthorizationList(transaction) {
    const authList = transaction.authorizationList || [];
    
    if (!Array.isArray(authList)) {
      console.warn('[KaiSign-EIP7702] Authorization list is not an array:', authList);
      return [];
    }

    return authList.map((auth, index) => {
      // Handle both object format and array format
      const parsed = {
        index: index + 1,
        chainId: auth.chainId || auth.chain_id || auth[0] || 'Unknown',
        address: auth.address || auth[1] || 'Unknown',
        nonce: auth.nonce || auth[2] || 'Unknown',
        yParity: auth.yParity || auth.y_parity || auth[3],
        r: auth.r || auth[4],
        s: auth.s || auth[5]
      };

      console.log(`[KaiSign-EIP7702] Parsed authorization ${index + 1}:`, parsed);
      return parsed;
    });
  }

  /**
   * Format transaction for display
   * @param {Object} transaction - Transaction object
   * @returns {Object} - Formatted transaction data
   */
  formatTransaction(transaction) {
    const isEIP7702 = this.isEIP7702Transaction(transaction);
    const authList = isEIP7702 ? this.parseAuthorizationList(transaction) : [];

    const formatted = {
      // Basic transaction info
      type: isEIP7702 ? 'EIP-7702 Account Abstraction' : 'Standard Transaction',
      isEIP7702: isEIP7702,
      to: transaction.to || 'Unknown',
      from: transaction.from || 'Unknown',
      value: transaction.value || '0x0',
      data: transaction.data || '0x',
      gasLimit: transaction.gas || transaction.gasLimit || 'Unknown',
      
      // EIP-7702 specific
      authorizationCount: authList.length,
      authorizationList: authList,
      
      // Raw data
      rawTransaction: transaction,
      
      // Timestamp
      timestamp: new Date().toISOString()
    };

    console.log('[KaiSign-EIP7702] Formatted transaction:', formatted);
    return formatted;
  }

  /**
   * Create authorization summary for UI
   * @param {Array} authList - Authorization list
   * @returns {string} - Human readable summary
   */
  createAuthorizationSummary(authList) {
    if (!authList || authList.length === 0) {
      return 'No authorizations';
    }

    const summaries = authList.slice(0, 3).map(auth => 
      `${auth.address.slice(0, 10)}... (Chain: ${auth.chainId}, Nonce: ${auth.nonce})`
    );

    if (authList.length > 3) {
      summaries.push(`... and ${authList.length - 3} more`);
    }

    return summaries.join('\n');
  }

  /**
   * Validate EIP-7702 transaction structure
   * @param {Object} transaction - Transaction to validate
   * @returns {Object} - Validation result
   */
  validateEIP7702Transaction(transaction) {
    const validation = {
      isValid: true,
      warnings: [],
      errors: []
    };

    if (!this.isEIP7702Transaction(transaction)) {
      validation.isValid = false;
      validation.errors.push('Not a valid EIP-7702 transaction');
      return validation;
    }

    // Check authorization list
    const authList = transaction.authorizationList;
    if (!authList || authList.length === 0) {
      validation.warnings.push('EIP-7702 transaction with empty authorization list');
    }

    // Validate each authorization
    if (authList && Array.isArray(authList)) {
      authList.forEach((auth, index) => {
        if (!auth.address && !auth[1]) {
          validation.errors.push(`Authorization ${index + 1} missing address`);
        }
        if (!auth.chainId && !auth.chain_id && !auth[0]) {
          validation.warnings.push(`Authorization ${index + 1} missing chain ID`);
        }
      });
    }

    // Check destination
    if (!transaction.to) {
      validation.errors.push('EIP-7702 transaction missing destination address');
    }

    validation.isValid = validation.errors.length === 0;
    
    console.log('[KaiSign-EIP7702] Validation result:', validation);
    return validation;
  }
}

// Export for use in content script
if (typeof window !== 'undefined') {
  window.EIP7702Detector = EIP7702Detector;
}

// Export for Node.js environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EIP7702Detector;
}