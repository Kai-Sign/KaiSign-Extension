/**
 * Runtime Registry - Minimal replacement for registry-loader.js
 * Contains only embedded ERC standards (never change)
 * All other metadata fetched from subgraph
 */

// Guard against duplicate loading (MAIN world scripts can run multiple times)
if (window.registryLoader) {
  console.log('[KaiSign] Runtime registry already loaded, skipping');
} else {

console.log('[KaiSign] Runtime registry loading...');

class RuntimeRegistry {
  constructor(metadataService) {
    this.metadataService = metadataService;
    this.selectorRegistry = new Map();
    this.initialized = false;

    // Initialize embedded selectors immediately
    this.buildEmbeddedSelectors();
  }

  /**
   * Build embedded ERC standard selectors (ERC-20, ERC-721, ERC-1155)
   * These are standardized and never change, so no need to fetch from subgraph
   */
  buildEmbeddedSelectors() {
    const ercSelectors = {
      // ERC-20 Standard
      '0x095ea7b3': {
        name: 'approve',
        signature: 'approve(address,uint256)',
        intent: 'Approve',
        category: 'approval',
        standard: 'ERC-20'
      },
      '0xa9059cbb': {
        name: 'transfer',
        signature: 'transfer(address,uint256)',
        intent: 'Transfer',
        category: 'transfer',
        standard: 'ERC-20'
      },
      '0x23b872dd': {
        name: 'transferFrom',
        signature: 'transferFrom(address,address,uint256)',
        intent: 'Transfer From',
        category: 'transfer',
        standard: 'ERC-20'
      },
      '0x70a08231': {
        name: 'balanceOf',
        signature: 'balanceOf(address)',
        intent: 'Check Balance',
        category: 'query',
        standard: 'ERC-20'
      },
      '0xdd62ed3e': {
        name: 'allowance',
        signature: 'allowance(address,address)',
        intent: 'Check Allowance',
        category: 'query',
        standard: 'ERC-20'
      },
      '0x18160ddd': {
        name: 'totalSupply',
        signature: 'totalSupply()',
        intent: 'Check Total Supply',
        category: 'query',
        standard: 'ERC-20'
      },

      // ERC-721 Standard (NFT)
      '0x42842e0e': {
        name: 'safeTransferFrom',
        signature: 'safeTransferFrom(address,address,uint256)',
        intent: 'Safe Transfer NFT',
        category: 'transfer',
        standard: 'ERC-721'
      },
      '0xb88d4fde': {
        name: 'safeTransferFrom',
        signature: 'safeTransferFrom(address,address,uint256,bytes)',
        intent: 'Safe Transfer NFT',
        category: 'transfer',
        standard: 'ERC-721'
      },
      '0x6352211e': {
        name: 'ownerOf',
        signature: 'ownerOf(uint256)',
        intent: 'Check NFT Owner',
        category: 'query',
        standard: 'ERC-721'
      },
      '0x081812fc': {
        name: 'getApproved',
        signature: 'getApproved(uint256)',
        intent: 'Check NFT Approval',
        category: 'query',
        standard: 'ERC-721'
      },
      '0xa22cb465': {
        name: 'setApprovalForAll',
        signature: 'setApprovalForAll(address,bool)',
        intent: 'Set Operator Approval',
        category: 'approval',
        standard: 'ERC-721'
      },

      // ERC-1155 Standard (Multi-Token)
      '0xf242432a': {
        name: 'safeTransferFrom',
        signature: 'safeTransferFrom(address,address,uint256,uint256,bytes)',
        intent: 'Safe Transfer Token',
        category: 'transfer',
        standard: 'ERC-1155'
      },
      '0x2eb2c2d6': {
        name: 'safeBatchTransferFrom',
        signature: 'safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)',
        intent: 'Safe Batch Transfer',
        category: 'transfer',
        standard: 'ERC-1155'
      },
      '0x00fdd58e': {
        name: 'balanceOf',
        signature: 'balanceOf(address,uint256)',
        intent: 'Check Token Balance',
        category: 'query',
        standard: 'ERC-1155'
      },
      '0x4e1273f4': {
        name: 'balanceOfBatch',
        signature: 'balanceOfBatch(address[],uint256[])',
        intent: 'Check Batch Balances',
        category: 'query',
        standard: 'ERC-1155'
      },

      // Common DeFi router/gateway selectors observed in real captures.
      // Used as a "Unknown call 0x..." fallback so the title at least names the action.
      '0xbcc3c255': {
        name: 'repayETH',
        signature: 'repayETH(address,uint256,address)',
        intent: 'Repay ETH loan',
        category: 'lending'
      },
      '0xf4e8cd69': {
        name: 'depositToLyra',
        signature: 'depositToLyra(address,address,bool,uint256,uint256,address)',
        intent: 'Deposit to Lyra',
        category: 'bridge'
      },
      '0x876a02f6': {
        name: 'swapExactAmountInOnUniswapV3',
        signature: 'swapExactAmountInOnUniswapV3((address,address,uint256,uint256,uint256,bytes32,address,bytes),uint256,bytes)',
        intent: 'Swap exact amount in on UniswapV3',
        category: 'swap'
      },
      '0x1fff991f': {
        name: 'execute',
        signature: 'execute((address,address,uint256),bytes[],bytes32)',
        intent: 'Execute',
        category: 'execute'
      }
    };

    // Populate selector registry
    for (const [selector, info] of Object.entries(ercSelectors)) {
      this.selectorRegistry.set(selector, info);
    }

    console.log('[Registry] Embedded ERC selectors loaded:', this.selectorRegistry.size);
    this.initialized = true;
  }

  /**
   * Get token info (symbol, decimals) from subgraph
   * @param {string} address - Token address
   * @returns {Promise<Object>} Token info
   */
  async getTokenInfo(address) {
    try {
      const tokenData = await this.metadataService.getTokenMetadata(address);
      return {
        symbol: tokenData.symbol,
        decimals: tokenData.decimals,
        name: tokenData.name,
        address: tokenData.address
      };
    } catch (error) {
      console.warn('[Registry] Token info not found:', address);
      return {
        symbol: 'TOKEN',
        decimals: 18,
        name: 'Unknown',
        address: address
      };
    }
  }

  /**
   * Get token symbol
   * @param {string} address - Token address
   * @returns {Promise<string>} Token symbol
   */
  async getTokenSymbol(address) {
    const info = await this.getTokenInfo(address);
    return info.symbol;
  }

  /**
   * Get token decimals
   * @param {string} address - Token address
   * @returns {Promise<number>} Token decimals
   */
  async getTokenDecimals(address) {
    const info = await this.getTokenInfo(address);
    return info.decimals;
  }

  /**
   * Get selector info (check embedded ERC standards first)
   * @param {string} selector - Function selector
   * @returns {Object|null} Selector info or null
   */
  getSelectorInfo(selector) {
    // Check embedded standards
    if (this.selectorRegistry.has(selector)) {
      return this.selectorRegistry.get(selector);
    }

    // For protocol-specific selectors, caller should use contract metadata
    return null;
  }

  /**
   * Get function info by selector (synchronous for embedded, async for protocols)
   * @param {string} selector - Function selector
   * @returns {Object|null} Function info
   */
  getFunctionInfo(selector) {
    return this.getSelectorInfo(selector);
  }

  /**
   * Get command info (Universal Router commands)
   * Note: This is now fetched from contract metadata, not a separate registry
   * @param {string} commandName - Command name
   * @returns {null} Deprecated - use contract metadata instead
   */
  getCommandInfo(commandName) {
    console.warn('[Registry] getCommandInfo is deprecated - use contract metadata instead');
    return null;
  }

  /**
   * Ensure registry is loaded (synchronous for embedded standards)
   * @returns {Promise<void>}
   */
  async ensureLoaded() {
    // Embedded standards are loaded immediately in constructor
    return Promise.resolve();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      embeddedSelectors: this.selectorRegistry.size,
      metadataServiceStats: this.metadataService.getCacheStats()
    };
  }
}

// Wait for metadataService to be ready
function initializeRegistry() {
  if (window.metadataService) {
    const registry = new RuntimeRegistry(window.metadataService);
    window.registryLoader = registry;
    console.log('[KaiSign] Runtime registry ready');
  } else {
    // Retry after 100ms if metadataService not ready
    setTimeout(initializeRegistry, 100);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeRegistry);
} else {
  initializeRegistry();
}

} // End of duplicate-load guard
