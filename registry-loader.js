// =============================================================================
// KAISIGN REGISTRY LOADER - Extract from ERC-7730 Metadata
// =============================================================================
console.log('[KaiSign] Loading registry loader...');

class RegistryLoader {
  constructor() {
    this.tokenRegistry = new Map(); // address -> token info
    this.selectorRegistry = new Map(); // selector -> function info
    this.contractMappings = new Map(); // address -> metadata path
    this.commandRegistry = null; // Universal Router commands
    this.intentFormatting = null; // Intent templates
    this.loaded = false;
    this.loading = null;

    // IMMEDIATELY load embedded selectors - these work in MAIN world
    this.loadEmbeddedSelectors();
  }

  /**
   * Load embedded ERC standard selectors - works in MAIN world without chrome.runtime
   * These are standard function selectors that never change
   */
  loadEmbeddedSelectors() {
    // ERC-20 Standard Selectors
    const erc20Selectors = {
      '0x095ea7b3': { name: 'approve', signature: 'approve(address,uint256)', intent: 'Approve', category: 'approval', isStandard: true },
      '0xa9059cbb': { name: 'transfer', signature: 'transfer(address,uint256)', intent: 'Transfer', category: 'transfer', isStandard: true },
      '0x23b872dd': { name: 'transferFrom', signature: 'transferFrom(address,address,uint256)', intent: 'Transfer From', category: 'transfer', isStandard: true },
      '0xd505accf': { name: 'permit', signature: 'permit(address,address,uint256,uint256,uint8,bytes32,bytes32)', intent: 'Permit', category: 'approval', isStandard: true },
      '0x39509351': { name: 'increaseAllowance', signature: 'increaseAllowance(address,uint256)', intent: 'Increase Allowance', category: 'approval', isStandard: true },
      '0xa457c2d7': { name: 'decreaseAllowance', signature: 'decreaseAllowance(address,uint256)', intent: 'Decrease Allowance', category: 'approval', isStandard: true },
    };

    // ERC-721 Standard Selectors
    const erc721Selectors = {
      '0x42842e0e': { name: 'safeTransferFrom', signature: 'safeTransferFrom(address,address,uint256)', intent: 'Transfer NFT', category: 'transfer', isStandard: true },
      '0xb88d4fde': { name: 'safeTransferFrom', signature: 'safeTransferFrom(address,address,uint256,bytes)', intent: 'Transfer NFT', category: 'transfer', isStandard: true },
      '0xa22cb465': { name: 'setApprovalForAll', signature: 'setApprovalForAll(address,bool)', intent: 'Set NFT Approval', category: 'approval', isStandard: true },
    };

    // ERC-1155 Standard Selectors
    const erc1155Selectors = {
      '0xf242432a': { name: 'safeTransferFrom', signature: 'safeTransferFrom(address,address,uint256,uint256,bytes)', intent: 'Transfer Multi-Token', category: 'transfer', isStandard: true },
      '0x2eb2c2d6': { name: 'safeBatchTransferFrom', signature: 'safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)', intent: 'Batch Transfer', category: 'transfer', isStandard: true },
    };

    // LiFi Diamond Selectors (bridging)
    const lifiSelectors = {
      '0x1794958f': { name: 'startBridgeTokensViaAcross', intent: 'Bridge via Across', category: 'bridge', isStandard: false },
      '0x4f93ad26': { name: 'swapAndStartBridgeTokensViaAcross', intent: 'Swap & Bridge via Across', category: 'bridge', isStandard: false },
      '0x4c83e9a6': { name: 'startBridgeTokensViaStargate', intent: 'Bridge via Stargate', category: 'bridge', isStandard: false },
      '0x02e649ff': { name: 'swapAndStartBridgeTokensViaStargate', intent: 'Swap & Bridge via Stargate', category: 'bridge', isStandard: false },
      '0x89e4e6bb': { name: 'startBridgeTokensViaCBridge', intent: 'Bridge via cBridge', category: 'bridge', isStandard: false },
      '0x45b1befe': { name: 'swapAndStartBridgeTokensViaCBridge', intent: 'Swap & Bridge via cBridge', category: 'bridge', isStandard: false },
      '0x1c3d5a48': { name: 'startBridgeTokensViaHop', intent: 'Bridge via Hop', category: 'bridge', isStandard: false },
      '0x0e41ca06': { name: 'swapAndStartBridgeTokensViaHop', intent: 'Swap & Bridge via Hop', category: 'bridge', isStandard: false },
    };

    // Safe Wallet Selectors
    const safeSelectors = {
      '0x8d80ff0a': { name: 'multiSend', signature: 'multiSend(bytes)', intent: 'Multi-Send', category: 'batch', isStandard: false },
      '0x6a761202': { name: 'execTransaction', signature: 'execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)', intent: 'Execute Transaction', category: 'execution', isStandard: false },
      '0x1688f0b9': { name: 'createProxyWithNonce', signature: 'createProxyWithNonce(address,bytes,uint256)', intent: 'Create Safe Wallet', category: 'deployment', isStandard: false },
    };

    // Merge all selectors
    const allSelectors = { ...erc20Selectors, ...erc721Selectors, ...erc1155Selectors, ...lifiSelectors, ...safeSelectors };

    for (const [selector, info] of Object.entries(allSelectors)) {
      this.selectorRegistry.set(selector.toLowerCase(), info);
    }

    // Common tokens - embedded for reliability
    const commonTokens = {
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { symbol: 'USDC', decimals: 6, name: 'USD Coin' },
      '0xdac17f958d2ee523a2206206994597c13d831ec7': { symbol: 'USDT', decimals: 6, name: 'Tether USD' },
      '0x6b175474e89094c44da98b954eedeac495271d0f': { symbol: 'DAI', decimals: 18, name: 'Dai Stablecoin' },
      '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { symbol: 'WETH', decimals: 18, name: 'Wrapped Ether' },
      '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': { symbol: 'WBTC', decimals: 8, name: 'Wrapped Bitcoin' },
      '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': { symbol: 'UNI', decimals: 18, name: 'Uniswap' },
      '0x514910771af9ca656af840dff83e8264ecf986ca': { symbol: 'LINK', decimals: 18, name: 'Chainlink' },
      '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9': { symbol: 'AAVE', decimals: 18, name: 'Aave' },
    };

    for (const [address, info] of Object.entries(commonTokens)) {
      this.tokenRegistry.set(address.toLowerCase(), info);
    }

    console.log(`[Registry] Embedded ${this.selectorRegistry.size} selectors (ERC-20/721/1155 + LiFi + Safe)`);
    console.log(`[Registry] Embedded ${this.tokenRegistry.size} common tokens`);

    // Mark as loaded immediately - embedded data is always available
    this.loaded = true;
  }

  /**
   * Get the base path for metadata files
   */
  getMetadataPath() {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      return chrome.runtime.getURL('local-metadata');
    }
    return 'local-metadata';
  }

  /**
   * Load a JSON file
   */
  async loadJSON(path) {
    try {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Failed to load ${path}: ${response.status}`);
      }
      return response.json();
    } catch (error) {
      console.error(`[Registry] Error loading ${path}:`, error);
      return null;
    }
  }

  /**
   * Calculate function selector from signature
   */
  calculateSelector(signature) {
    try {
      // Use ethers.js keccak256 if available
      if (window.ethers?.utils?.keccak256 && window.ethers?.utils?.toUtf8Bytes) {
        const hash = window.ethers.utils.keccak256(window.ethers.utils.toUtf8Bytes(signature));
        return '0x' + hash.slice(2, 10);
      }

      // Fallback: return null to skip selector extraction
      return null;
    } catch (error) {
      console.error('[Registry] Error calculating selector:', error);
      return null;
    }
  }

  /**
   * Load all token metadata from manifest
   */
  async loadTokens(manifest) {
    const basePath = this.getMetadataPath();
    const tokenPaths = manifest.tokens || [];

    const promises = tokenPaths.map(async (tokenPath) => {
      const metadata = await this.loadJSON(`${basePath}/${tokenPath}`);
      if (!metadata) return;

      const symbol = metadata.metadata?.symbol || metadata.display?.formats?.token?.symbol;
      const decimals = metadata.metadata?.decimals ?? metadata.display?.formats?.token?.decimals ?? 18;
      const name = metadata.metadata?.name || metadata.display?.formats?.token?.name;

      // Extract all deployment addresses
      const deployments = metadata.context?.contract?.deployments || [];
      deployments.forEach(deployment => {
        if (deployment.address) {
          const normalized = deployment.address.toLowerCase();
          this.tokenRegistry.set(normalized, {
            symbol,
            decimals,
            name,
            chainId: deployment.chainId
          });
        }
      });
    });

    await Promise.all(promises);
    console.log(`[Registry] Loaded ${this.tokenRegistry.size} token addresses from ERC-7730 metadata`);
  }

  /**
   * Load all contract metadata files and extract ABIs and mappings
   */
  async loadContracts(manifest) {
    const basePath = this.getMetadataPath();
    const contractPaths = manifest.contracts || [];

    const promises = contractPaths.map(async (path) => {
      const metadata = await this.loadJSON(`${basePath}/${path}`);
      if (!metadata) return;

      // Extract contract addresses and map to metadata path
      const deployments = metadata.context?.contract?.deployments;
      if (deployments) {
        Object.values(deployments).forEach(deployment => {
          if (deployment.address) {
            const normalized = deployment.address.toLowerCase();
            this.contractMappings.set(normalized, path);
          }
        });
      }

      // Extract function selectors from ABI
      const abi = metadata.context?.contract?.abi || [];
      abi.forEach(item => {
        if (item.type === 'function' && item.name) {
          // Build function signature
          const inputs = item.inputs?.map(i => i.type).join(',') || '';
          const signature = `${item.name}(${inputs})`;

          // Use stored selector or calculate from signature
          const selector = item.selector || this.calculateSelector(signature);

          if (selector) {
            const normalized = selector.toLowerCase();

            // Extract intent from display formats if available
            const displayFormats = metadata.display?.formats || {};
            const functionFormat = displayFormats[signature] || displayFormats[item.name];
            const intent = this.extractIntentFromFormat(functionFormat);

            this.selectorRegistry.set(normalized, {
              signature,
              name: item.name,
              intent: intent || item.name,
              inputs: item.inputs,
              outputs: item.outputs,
              stateMutability: item.stateMutability
            });
          }
        }
      });
    });

    await Promise.all(promises);
    console.log(`[Registry] Loaded ${this.contractMappings.size} contract mappings from ERC-7730 metadata`);
    console.log(`[Registry] Extracted ${this.selectorRegistry.size} function selectors from ABIs`);
  }

  /**
   * Extract intent string from ERC-7730 display format
   */
  extractIntentFromFormat(format) {
    if (!format) return null;

    // Look for intent in format structure
    const intentFormat = format.intent?.format;
    if (!intentFormat) return null;

    // Find first text value that looks like an intent
    for (const field of intentFormat) {
      if (field.type === 'container' && field.fields) {
        for (const subfield of field.fields) {
          if (subfield.type === 'text' && subfield.value && subfield.format === 'heading2') {
            return subfield.value;
          }
        }
      }
      if (field.type === 'text' && field.value && field.format === 'heading2') {
        return field.value;
      }
    }

    return null;
  }

  /**
   * Load ERC standard selectors (ERC-20, ERC-721, ERC-1155)
   */
  async loadStandards(manifest) {
    const basePath = this.getMetadataPath();
    const standardPaths = manifest.standards || [];
    let selectorCount = 0;

    console.log(`[Registry] Loading ${standardPaths.length} ERC standard files...`);

    const promises = standardPaths.map(async (path) => {
      const metadata = await this.loadJSON(`${basePath}/${path}`);
      if (!metadata) {
        console.warn(`[Registry] Failed to load standard: ${path}`);
        return;
      }

      console.log(`[Registry] Processing standard: ${path}`);

      // Extract selectors from ABI
      const abi = metadata.context?.contract?.abi || [];
      abi.forEach(item => {
        if (item.type === 'function' && item.selector) {
          const normalized = item.selector.toLowerCase();

          // Get display format for this function
          const displayFormat = metadata.display?.formats?.[item.name];
          const intent = displayFormat?.intent || item.name;
          const category = displayFormat?.category || 'unknown';

          // Build function signature
          const inputs = item.inputs?.map(i => i.type).join(',') || '';
          const signature = `${item.name}(${inputs})`;

          this.selectorRegistry.set(normalized, {
            signature,
            name: item.name,
            intent,
            category,
            inputs: item.inputs,
            outputs: item.outputs,
            stateMutability: item.stateMutability,
            isStandard: true
          });

          selectorCount++;
          console.log(`[Registry] Registered: ${normalized} -> ${item.name} (intent: ${intent}, category: ${category})`);
        }
      });
    });

    await Promise.all(promises);
    console.log(`[Registry] ✅ Loaded ${selectorCount} selectors from ${standardPaths.length} ERC standard files`);
    console.log(`[Registry] Total selectors in registry: ${this.selectorRegistry.size}`);

    // Verify critical selectors
    const approveSelector = this.selectorRegistry.get('0x095ea7b3');
    console.log(`[Registry] approve (0x095ea7b3): ${approveSelector ? `FOUND - intent: ${approveSelector.intent}` : 'NOT FOUND'}`);
  }

  /**
   * Load protocol-specific registries
   */
  async loadProtocolRegistries(manifest) {
    const basePath = this.getMetadataPath();
    const registries = manifest.registries || {};

    // Load Universal Router commands (protocol-specific)
    if (registries.universalRouterCommands) {
      this.commandRegistry = await this.loadJSON(`${basePath}/${registries.universalRouterCommands}`);
    }

    // Load intent formatting templates (cross-contract)
    if (registries.intentFormatting) {
      this.intentFormatting = await this.loadJSON(`${basePath}/${registries.intentFormatting}`);
    }
  }

  /**
   * Load all registries
   */
  async loadAllRegistries() {
    if (this.loaded) return true;
    if (this.loading) return this.loading;

    this.loading = (async () => {
      try {
        console.log('[Registry] Loading from ERC-7730 metadata files...');

        // Load manifest first
        const basePath = this.getMetadataPath();
        console.log('[Registry] Base path:', basePath);

        const manifest = await this.loadJSON(`${basePath}/manifest.json`);
        console.log('[Registry] Manifest loaded:', !!manifest);

        if (!manifest) {
          console.error('[Registry] Failed to load manifest.json from:', `${basePath}/manifest.json`);
          return false;
        }

        console.log('[Registry] Manifest has standards:', manifest.standards?.length || 0);

        await Promise.all([
          this.loadTokens(manifest),
          this.loadContracts(manifest),
          this.loadStandards(manifest),
          this.loadProtocolRegistries(manifest)
        ]);

        this.loaded = true;
        console.log('[Registry] ✅ All ERC-7730 metadata loaded successfully');
        return true;
      } catch (error) {
        console.error('[Registry] Failed to load:', error);
        return false;
      }
    })();

    return this.loading;
  }

  /**
   * Ensure registries are loaded - waits for loading to complete
   */
  async ensureLoaded() {
    // If already loaded, return immediately
    if (this.loaded) {
      return true;
    }

    // If loading is in progress, wait for it
    if (this.loading) {
      await this.loading;
    }

    // If still not loaded (first call or previous failed), try loading
    if (!this.loaded && !this.loading) {
      await this.loadAllRegistries();
    }

    // Wait a bit for async initialization if still loading
    let attempts = 0;
    while (!this.loaded && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    if (!this.loaded) {
      console.error('[Registry] Failed to load after waiting');
    }

    return this.loaded;
  }

  // ===========================================================================
  // TOKEN LOOKUP METHODS
  // ===========================================================================

  getTokenInfo(address) {
    if (!address) return null;
    const normalized = address.toLowerCase();
    return this.tokenRegistry.get(normalized) || null;
  }

  getTokenSymbol(address) {
    if (!address) return 'TOKEN';

    const info = this.getTokenInfo(address);
    if (info) return info.symbol;

    // Check for ETH special addresses
    if (address === '0x0000000000000000000000000000000000000000' ||
        address === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
      return 'ETH';
    }

    return address.slice(0, 6) + '...';
  }

  getTokenDecimals(address) {
    const info = this.getTokenInfo(address);
    return info?.decimals ?? 18;
  }

  // ===========================================================================
  // SELECTOR LOOKUP METHODS
  // ===========================================================================

  getSelectorInfo(selector) {
    if (!selector) return null;
    const normalized = selector.toLowerCase();
    return this.selectorRegistry.get(normalized) || null;
  }

  getFunctionName(selector) {
    const info = this.getSelectorInfo(selector);
    return info?.signature || info?.name || 'unknown';
  }

  getSelectorIntent(selector) {
    const info = this.getSelectorInfo(selector);
    return info?.intent || 'Contract Call';
  }

  isMulticallSelector(selector) {
    const info = this.getSelectorInfo(selector);
    if (!info) return false;

    // Check if function name indicates multicall
    const name = info.name?.toLowerCase() || '';
    return name.includes('multi') || name.includes('batch') || name.includes('aggregate');
  }

  // ===========================================================================
  // UNIVERSAL ROUTER COMMAND METHODS
  // ===========================================================================

  getCommandInfo(commandByte) {
    if (!this.commandRegistry) {
      return this.getDefaultCommandInfo(commandByte);
    }

    const hex = typeof commandByte === 'number'
      ? '0x' + commandByte.toString(16).padStart(2, '0')
      : commandByte.toLowerCase();

    const info = this.commandRegistry.commands?.[hex];
    if (info) {
      return {
        name: info.name,
        intent: info.intent,
        category: info.category,
        action: info.action
      };
    }

    return this.getDefaultCommandInfo(commandByte);
  }

  getDefaultCommandInfo(commandByte) {
    const hex = typeof commandByte === 'number'
      ? commandByte.toString(16).padStart(2, '0')
      : commandByte.replace('0x', '');

    return {
      name: `UNKNOWN_CMD_0x${hex}`,
      intent: 'Unknown',
      category: 'unknown',
      action: 'unknown'
    };
  }

  // ===========================================================================
  // INTENT FORMATTING METHODS
  // ===========================================================================

  formatIntent(templateName, params = {}) {
    if (!this.intentFormatting) {
      return params.default || 'Contract Interaction';
    }

    let template = this.intentFormatting.templates?.[templateName];

    if (!template && params.category) {
      template = this.intentFormatting.categoryDefaults?.[params.category];
    }

    if (!template) {
      return params.default || this.intentFormatting.categoryDefaults?.unknown || 'Contract Interaction';
    }

    let result = template;
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
      }
    }

    result = result.replace(/\{[^}]+\}/g, '');
    return result.trim();
  }

  // ===========================================================================
  // CONTRACT MAPPING METHODS
  // ===========================================================================

  getContractMetadataPath(address) {
    if (!address) return null;
    const normalized = address.toLowerCase();
    return this.contractMappings.get(normalized) || null;
  }

  hasContractMetadata(address) {
    return this.getContractMetadataPath(address) !== null;
  }

  getMappedContractAddresses() {
    return Array.from(this.contractMappings.keys());
  }
}

// =============================================================================
// GLOBAL INSTANCE AND AUTO-INITIALIZATION
// =============================================================================

window.registryLoader = new RegistryLoader();

(async () => {
  try {
    const success = await window.registryLoader.loadAllRegistries();
    if (success) {
      console.log('[Registry] ✅ Ready for ERC-7730 metadata-driven lookups');
    } else {
      console.warn('[Registry] ⚠️  Failed to load - falling back to defaults');
    }
  } catch (error) {
    console.error('[Registry] Initialization error:', error);
  }
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RegistryLoader };
}
