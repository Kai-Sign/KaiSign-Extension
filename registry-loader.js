// =============================================================================
// KAISIGN REGISTRY LOADER - Async Metadata-Driven Lookups
// =============================================================================
console.log('[KaiSign] Loading registry loader...');

class RegistryLoader {
  constructor() {
    this.tokenRegistry = null;
    this.selectorRegistry = null;
    this.commandRegistry = null;
    this.intentFormatting = null;
    this.contractMappings = null;
    this.loaded = false;
    this.loading = null; // Promise for loading state
  }

  /**
   * Get the base path for registry files
   */
  getRegistryPath() {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      return chrome.runtime.getURL('local-metadata/registry');
    }
    return 'local-metadata/registry';
  }

  /**
   * Load a single registry JSON file
   */
  async loadRegistry(filename) {
    try {
      const path = `${this.getRegistryPath()}/${filename}`;
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Failed to load ${filename}: ${response.status}`);
      }
      return response.json();
    } catch (error) {
      console.error(`[Registry] Error loading ${filename}:`, error);
      return null;
    }
  }

  /**
   * Load all registries in parallel
   */
  async loadAllRegistries() {
    // If already loaded, return immediately
    if (this.loaded) {
      return true;
    }

    // If currently loading, wait for the existing promise
    if (this.loading) {
      return this.loading;
    }

    // Start loading
    this.loading = (async () => {
      try {
        console.log('[Registry] Loading all registries...');

        const [tokens, selectors, commands, formatting, mappings] = await Promise.all([
          this.loadRegistry('tokens.json'),
          this.loadRegistry('selectors.json'),
          this.loadRegistry('universal-router-commands.json'),
          this.loadRegistry('intent-formatting.json'),
          this.loadRegistry('contract-mappings.json')
        ]);

        this.tokenRegistry = tokens;
        this.selectorRegistry = selectors;
        this.commandRegistry = commands;
        this.intentFormatting = formatting;
        this.contractMappings = mappings;
        this.loaded = true;

        console.log('[Registry] All registries loaded successfully');
        console.log(`[Registry] Tokens: ${Object.keys(this.tokenRegistry?.tokens || {}).length}`);
        console.log(`[Registry] Commands: ${Object.keys(this.commandRegistry?.commands || {}).length}`);
        console.log(`[Registry] Contract mappings: ${Object.keys(this.contractMappings?.mappings || {}).length}`);

        return true;
      } catch (error) {
        console.error('[Registry] Failed to load registries:', error);
        return false;
      }
    })();

    return this.loading;
  }

  /**
   * Ensure registries are loaded before performing lookups
   */
  async ensureLoaded() {
    if (!this.loaded) {
      await this.loadAllRegistries();
    }
  }

  // ===========================================================================
  // TOKEN LOOKUP METHODS
  // ===========================================================================

  /**
   * Get full token info by address
   */
  getTokenInfo(address) {
    if (!this.tokenRegistry || !address) return null;

    const normalized = address.toLowerCase();

    // Check regular tokens first
    if (this.tokenRegistry.tokens?.[normalized]) {
      return this.tokenRegistry.tokens[normalized];
    }

    // Check special addresses (ETH, etc.)
    if (this.tokenRegistry.specialAddresses?.[normalized]) {
      return this.tokenRegistry.specialAddresses[normalized];
    }

    return null;
  }

  /**
   * Get token symbol by address
   */
  getTokenSymbol(address) {
    if (!address) return 'TOKEN';

    const info = this.getTokenInfo(address);
    if (info) {
      return info.symbol;
    }

    // Return shortened address if unknown
    return address.slice(0, 6) + '...';
  }

  /**
   * Get token decimals by address
   */
  getTokenDecimals(address) {
    const info = this.getTokenInfo(address);
    return info?.decimals ?? 18;
  }

  // ===========================================================================
  // SELECTOR LOOKUP METHODS
  // ===========================================================================

  /**
   * Get selector info by 4-byte selector
   */
  getSelectorInfo(selector) {
    if (!this.selectorRegistry || !selector) return null;

    const normalized = selector.toLowerCase();

    // Search through all categories
    for (const category of Object.values(this.selectorRegistry.categories || {})) {
      if (category.selectors?.[normalized]) {
        return category.selectors[normalized];
      }
    }

    return null;
  }

  /**
   * Get function name/signature from selector
   */
  getFunctionName(selector) {
    const info = this.getSelectorInfo(selector);
    return info?.signature || info?.name || 'unknown';
  }

  /**
   * Get intent for a selector
   */
  getSelectorIntent(selector) {
    const info = this.getSelectorInfo(selector);
    return info?.intent || 'Contract Call';
  }

  /**
   * Check if a selector is a multicall pattern
   */
  isMulticallSelector(selector) {
    const info = this.getSelectorInfo(selector);
    return info?.isMulticall === true;
  }

  /**
   * Get decoding hint for a selector
   */
  getDecodingHint(selector) {
    const info = this.getSelectorInfo(selector);
    return info?.decodingHint || null;
  }

  // ===========================================================================
  // UNIVERSAL ROUTER COMMAND METHODS
  // ===========================================================================

  /**
   * Get command info by command byte
   */
  getCommandInfo(commandByte) {
    if (!this.commandRegistry) {
      return this.getDefaultCommandInfo(commandByte);
    }

    // Convert to hex string if needed
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

  /**
   * Get default command info for unknown commands
   */
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

  /**
   * Format an intent string using templates
   */
  formatIntent(templateName, params = {}) {
    if (!this.intentFormatting) {
      return params.default || 'Contract Interaction';
    }

    // Try to get the specific template
    let template = this.intentFormatting.templates?.[templateName];

    // Fall back to category default if no template
    if (!template && params.category) {
      template = this.intentFormatting.categoryDefaults?.[params.category];
    }

    // Final fallback
    if (!template) {
      return params.default || this.intentFormatting.categoryDefaults?.unknown || 'Contract Interaction';
    }

    // Replace template variables
    let result = template;
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
      }
    }

    // Remove any remaining unreplaced placeholders
    result = result.replace(/\{[^}]+\}/g, '');

    return result.trim();
  }

  /**
   * Get the default intent for a category
   */
  getCategoryDefault(category) {
    if (!this.intentFormatting) return 'Contract Interaction';
    return this.intentFormatting.categoryDefaults?.[category] || 'Contract Interaction';
  }

  /**
   * Get the template name for an action
   */
  getTemplateForAction(action) {
    if (!this.intentFormatting) return null;
    return this.intentFormatting.actionToTemplate?.[action] || null;
  }

  // ===========================================================================
  // CONTRACT MAPPING METHODS
  // ===========================================================================

  /**
   * Get metadata file path for a contract address
   */
  getContractMetadataPath(address) {
    if (!this.contractMappings || !address) return null;

    const normalized = address.toLowerCase();
    return this.contractMappings.mappings?.[normalized] || null;
  }

  /**
   * Check if a contract has metadata
   */
  hasContractMetadata(address) {
    return this.getContractMetadataPath(address) !== null;
  }

  /**
   * Get all contract addresses that have metadata
   */
  getMappedContractAddresses() {
    if (!this.contractMappings) return [];
    return Object.keys(this.contractMappings.mappings || {});
  }
}

// =============================================================================
// GLOBAL INSTANCE AND AUTO-INITIALIZATION
// =============================================================================

// Create global instance
window.registryLoader = new RegistryLoader();

// Auto-load registries when script loads
(async () => {
  try {
    const success = await window.registryLoader.loadAllRegistries();
    if (success) {
      console.log('[Registry] Ready for metadata-driven lookups');
    } else {
      console.warn('[Registry] Failed to load - falling back to defaults');
    }
  } catch (error) {
    console.error('[Registry] Initialization error:', error);
  }
})();

// Export for module systems if needed
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RegistryLoader };
}
