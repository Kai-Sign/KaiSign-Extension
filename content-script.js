// =============================================================================
// KAISIGN CONTENT SCRIPT - TRANSACTION ANALYSIS & CLEAR SIGNING
// =============================================================================

// Inject complete embedded styles (MAIN world cannot load external CSS files)
(function injectStyles() {
  if (document.getElementById('kaisign-styles')) return;
  const style = document.createElement('style');
  style.id = 'kaisign-styles';
  style.textContent = `
    /* KaiSign Complete Embedded Styles - Minimalist Dark Theme */
    .kaisign-popup { position: fixed; top: 20px; right: 20px; width: 420px; max-height: 85vh; overflow-y: auto; background: #161b22; color: #e6edf3; padding: 0; border-radius: 12px; z-index: 2147483647; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; line-height: 1.5; box-shadow: 0 16px 48px rgba(0,0,0,0.5); border: 1px solid #30363d; }
    .kaisign-popup * { box-sizing: border-box; }
    .kaisign-popup-header { display: flex; justify-content: space-between; align-items: center; padding: 16px; border-bottom: 1px solid #30363d; background: #0d1117; border-radius: 12px 12px 0 0; }
    .kaisign-popup-logo { display: flex; align-items: center; gap: 10px; }
    .kaisign-popup-logo-icon { width: 28px; height: 28px; background: linear-gradient(135deg, #58a6ff, #a371f7); border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 10px; color: white; }
    .kaisign-popup-title { font-size: 14px; font-weight: 600; color: #e6edf3; }
    .kaisign-popup-subtitle { font-size: 11px; color: #8b949e; }
    .kaisign-close-btn { width: 28px; height: 28px; background: transparent; border: 1px solid #30363d; border-radius: 6px; color: #8b949e; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease; }
    .kaisign-close-btn:hover { background: #f85149; border-color: #f85149; color: white; }
    .kaisign-warning { padding: 10px 16px; background: rgba(248, 81, 73, 0.1); border-bottom: 1px solid #30363d; font-size: 11px; color: #f85149; text-align: center; }
    .kaisign-intent-section { padding: 16px; background: #21262d; border-bottom: 1px solid #30363d; }
    .kaisign-intent { font-size: 16px; font-weight: 600; color: #3fb950; margin-bottom: 12px; }
    .kaisign-details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .kaisign-detail-item { font-size: 12px; }
    .kaisign-detail-label { color: #ffd700; font-weight: 500; }
    .kaisign-detail-value { color: #e6edf3; word-break: break-all; font-family: 'SF Mono', Consolas, monospace; }
    .kaisign-popup-content { padding: 16px; }
    .kaisign-section { margin-bottom: 16px; padding: 12px; background: #0d1117; border-radius: 8px; border-left: 3px solid #58a6ff; }
    .kaisign-section.success { border-left-color: #3fb950; }
    .kaisign-section.error { border-left-color: #f85149; }
    .kaisign-section.purple { border-left-color: #a371f7; }
    .kaisign-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .kaisign-section-title { font-size: 12px; font-weight: 600; color: #58a6ff; display: flex; align-items: center; gap: 6px; }
    .kaisign-section-title.green { color: #3fb950; }
    .kaisign-section-title.red { color: #f85149; }
    .kaisign-section-title.purple { color: #a371f7; }
    .kaisign-copy-btn { padding: 4px 8px; background: #58a6ff; color: white; border: none; border-radius: 4px; font-size: 10px; cursor: pointer; transition: all 0.2s ease; }
    .kaisign-copy-btn:hover { background: #4c8ed9; }
    .kaisign-copy-btn.copied { background: #3fb950; }
    .kaisign-bytecode { background: #0d1117; padding: 8px; border-radius: 4px; word-break: break-all; max-height: 100px; overflow-y: auto; font-family: 'SF Mono', Consolas, monospace; font-size: 10px; color: #8b949e; border: 1px solid #30363d; }
    .kaisign-bytecode-info { margin-top: 8px; font-size: 10px; color: #6e7681; }
    .kaisign-tree { background: #0d1117; padding: 12px; border-radius: 6px; margin-top: 8px; }
    .kaisign-tree-header { font-size: 11px; font-weight: 600; color: #3fb950; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #30363d; }
    .kaisign-tree-item { margin: 6px 0; padding: 8px; background: #161b22; border-radius: 4px; border-left: 3px solid #ffd700; }
    .kaisign-tree-item.level-1 { border-left-color: #ffd700; }
    .kaisign-tree-item.level-2 { border-left-color: #f85149; margin-left: 16px; }
    .kaisign-tree-item.level-3 { border-left-color: #4ecdc4; margin-left: 32px; }
    .kaisign-tree-item.level-4 { border-left-color: #45b7d1; margin-left: 48px; }
    .kaisign-tree-item.level-5 { border-left-color: #96ceb4; margin-left: 64px; }
    .kaisign-tree-selector { font-family: 'SF Mono', Consolas, monospace; font-weight: 600; color: #ffd700; }
    .kaisign-tree-level { font-size: 9px; color: #6e7681; margin-left: 8px; }
    .kaisign-tree-details { margin-top: 4px; font-size: 10px; color: #8b949e; }
    .kaisign-tree-target { color: #58a6ff; }
    .kaisign-tree-function { color: #3fb950; margin-left: 8px; }
    .kaisign-tree-intent { color: #ffd700; font-weight: 500; }
    .kaisign-tree-bytecode { margin-top: 6px; }
    .kaisign-tree-bytecode-label { font-size: 9px; font-weight: 600; color: #a371f7; margin-bottom: 4px; }
    .kaisign-tree-bytecode-value { background: #0d1117; padding: 6px; border-radius: 3px; word-break: break-all; max-height: 50px; overflow-y: auto; font-size: 8px; color: #8b949e; font-family: 'SF Mono', Consolas, monospace; }
    .kaisign-tree-footer { margin-top: 8px; padding-top: 8px; border-top: 1px solid #30363d; font-size: 9px; color: #3fb950; text-align: center; }
    .kaisign-decode-result { font-size: 11px; }
    .kaisign-decode-success { color: #3fb950; margin-bottom: 4px; }
    .kaisign-decode-error { color: #f85149; }
    .kaisign-decode-detail { color: #8b949e; margin: 2px 0; }
    .kaisign-action-bar { display: flex; gap: 8px; padding: 16px; border-top: 1px solid #30363d; background: #0d1117; border-radius: 0 0 12px 12px; }
    .kaisign-btn { flex: 1; padding: 8px 12px; border-radius: 6px; font-size: 11px; font-weight: 500; cursor: pointer; transition: all 0.2s ease; display: flex; align-items: center; justify-content: center; gap: 6px; border: none; }
    .kaisign-btn-primary { background: #58a6ff; color: white; }
    .kaisign-btn-primary:hover { background: #4c8ed9; }
    .kaisign-btn-secondary { background: #21262d; color: #e6edf3; border: 1px solid #30363d; }
    .kaisign-btn-secondary:hover { background: #30363d; }
    .kaisign-btn-purple { background: #a371f7; color: white; }
    .kaisign-btn-purple:hover { background: #8b5cf6; }
    /* Modal styles */
    .kaisign-modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 90vw; max-width: 800px; max-height: 85vh; overflow-y: auto; background: #161b22; color: #e6edf3; padding: 0; border-radius: 12px; z-index: 2147483647; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; line-height: 1.5; box-shadow: 0 16px 48px rgba(0,0,0,0.6); border: 1px solid #30363d; }
    .kaisign-modal * { box-sizing: border-box; }
    .kaisign-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #30363d; background: #0d1117; border-radius: 12px 12px 0 0; }
    .kaisign-modal-title { font-size: 16px; font-weight: 600; color: #58a6ff; }
    .kaisign-modal-actions { display: flex; gap: 8px; }
    .kaisign-modal-content { padding: 16px 20px; }
    .kaisign-history-item { margin-bottom: 12px; padding: 14px; background: #0d1117; border-radius: 8px; border: 1px solid #30363d; }
    .kaisign-history-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .kaisign-history-intent { font-weight: 500; color: #3fb950; }
    .kaisign-history-time { font-size: 10px; color: #6e7681; }
    .kaisign-history-details { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px; margin-bottom: 8px; }
    .kaisign-history-detail { color: #8b949e; }
    .kaisign-history-detail strong { color: #e6edf3; }
    .kaisign-history-data { margin-top: 8px; }
    .kaisign-history-data-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
    .kaisign-history-data-label { font-size: 10px; color: #ffd700; }
    .kaisign-history-data-value { background: #161b22; padding: 6px; border-radius: 4px; word-break: break-all; max-height: 60px; overflow-y: auto; font-size: 9px; font-family: 'SF Mono', Consolas, monospace; color: #8b949e; }
    .kaisign-modal-footer { padding: 16px 20px; border-top: 1px solid #30363d; text-align: center; background: #0d1117; border-radius: 0 0 12px 12px; }
    /* Dashboard styles */
    .kaisign-dashboard { position: fixed; top: 5%; left: 5%; width: 90vw; height: 90vh; overflow-y: auto; background: #0d1117; color: #e6edf3; padding: 0; border-radius: 12px; z-index: 2147483647; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; line-height: 1.5; box-shadow: 0 16px 48px rgba(0,0,0,0.7); border: 1px solid #30363d; }
    .kaisign-dashboard * { box-sizing: border-box; }
    .kaisign-dashboard-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; border-bottom: 1px solid #30363d; background: #161b22; position: sticky; top: 0; z-index: 10; }
    .kaisign-dashboard-title { font-size: 18px; font-weight: 600; color: #58a6ff; }
    .kaisign-dashboard-content { padding: 24px; }
    .kaisign-stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .kaisign-stat-card { background: #161b22; padding: 16px; border-radius: 8px; border: 1px solid #30363d; }
    .kaisign-stat-value { font-size: 28px; font-weight: 600; color: #e6edf3; font-family: 'SF Mono', Consolas, monospace; }
    .kaisign-stat-label { font-size: 11px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
    .kaisign-category { margin-bottom: 24px; }
    .kaisign-category-title { font-size: 14px; font-weight: 600; color: #e6edf3; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #30363d; }
    .kaisign-method-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
    .kaisign-method-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #161b22; border-radius: 6px; border: 1px solid #30363d; font-size: 11px; }
    .kaisign-method-name { font-family: 'SF Mono', Consolas, monospace; color: #e6edf3; }
    .kaisign-method-count { background: #21262d; padding: 2px 8px; border-radius: 10px; font-size: 10px; color: #58a6ff; }
    .kaisign-security-alert { padding: 12px; background: rgba(248, 81, 73, 0.1); border: 1px solid #f85149; border-radius: 6px; margin-bottom: 8px; }
    .kaisign-security-alert-title { font-weight: 600; color: #f85149; margin-bottom: 4px; }
    .kaisign-security-alert-desc { font-size: 11px; color: #8b949e; }
    .kaisign-empty { text-align: center; padding: 40px; color: #6e7681; }
    /* Scrollbar styling */
    .kaisign-popup::-webkit-scrollbar, .kaisign-modal::-webkit-scrollbar, .kaisign-dashboard::-webkit-scrollbar { width: 6px; }
    .kaisign-popup::-webkit-scrollbar-track, .kaisign-modal::-webkit-scrollbar-track, .kaisign-dashboard::-webkit-scrollbar-track { background: transparent; }
    .kaisign-popup::-webkit-scrollbar-thumb, .kaisign-modal::-webkit-scrollbar-thumb, .kaisign-dashboard::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }
    .kaisign-popup::-webkit-scrollbar-thumb:hover, .kaisign-modal::-webkit-scrollbar-thumb:hover, .kaisign-dashboard::-webkit-scrollbar-thumb:hover { background: #484f58; }
  `;
  document.head.appendChild(style);
  console.log('[KaiSign] Embedded styles injected');
})();

// =============================================================================
// UNIVERSAL ROUTER TRANSACTION PARSER (ETHERS.JS APPROACH)
// =============================================================================

// Minimal ABI decoder for Universal Router (replaces ethers.js dependency)
class SimpleABIDecoder {
  static decodeExecuteFunction(txData) {
    if (!txData || txData.length < 10) return null;

    // Remove function selector (first 4 bytes / 10 hex chars)
    const payload = txData.slice(10);
    
    try {
      // Parse ABI-encoded parameters: execute(bytes commands, bytes[] inputs, uint256 deadline)
      const commandsOffset = parseInt(payload.slice(0, 64), 16) * 2;
      const inputsOffset = parseInt(payload.slice(64, 128), 16) * 2; 
      const deadline = parseInt(payload.slice(128, 192), 16);
      
      // Parse commands bytes
      const commandsLength = parseInt(payload.slice(commandsOffset, commandsOffset + 64), 16) * 2;
      const commandsData = '0x' + payload.slice(commandsOffset + 64, commandsOffset + 64 + commandsLength);
      
      // Parse inputs array
      const inputsArrayLength = parseInt(payload.slice(inputsOffset, inputsOffset + 64), 16);
      const inputs = [];
      
      // Extract each input
      let currentOffset = inputsOffset + 64; // Skip array length
      for (let i = 0; i < inputsArrayLength; i++) {
        const inputOffsetRelative = parseInt(payload.slice(currentOffset, currentOffset + 64), 16) * 2;
        const inputDataStart = inputsOffset + inputOffsetRelative;
        const inputLength = parseInt(payload.slice(inputDataStart, inputDataStart + 64), 16) * 2;
        const inputData = '0x' + payload.slice(inputDataStart + 64, inputDataStart + 64 + inputLength);
        
        inputs.push(inputData);
        currentOffset += 64;
      }
      
      return {
        commands: commandsData,
        inputs: inputs,
        deadline: deadline
      };
    } catch (error) {
      console.error('[SimpleABIDecoder] Error:', error);
      return null;
    }
  }
}

// Token lookups now use registryLoader (loaded from local-metadata/registry/tokens.json)
// See registry-loader.js for implementation
// NOTE: Universal Router ABI removed - now loaded from metadata via window.metadataService

// =============================================================================
// SELECTOR UTILITIES - Get selectors from registry instead of hardcoding
// =============================================================================

/**
 * Get selector for a known function from the registry
 * @param {string} functionName - e.g., 'multiSend', 'execute', 'execTransaction'
 * @returns {string|null} - The selector or null if not found
 */
function getKnownSelector(functionName) {
  // Use registryLoader if available
  if (window.registryLoader) {
    const selector = window.registryLoader.getSelectorByName?.(functionName);
    if (selector) return selector;
  }
  return null;
}

/**
 * Check if transaction data matches a known function by name
 * Uses registry lookup instead of hardcoded selectors
 */
function matchesFunction(txData, functionName) {
  if (!txData || txData.length < 10) return false;
  const selector = txData.slice(0, 10).toLowerCase();

  // Check registry for this function name
  if (window.registryLoader) {
    const knownSelector = window.registryLoader.getSelectorByName?.(functionName);
    if (knownSelector && selector === knownSelector.toLowerCase()) return true;

    // Also check selector info for function name
    const selectorInfo = window.registryLoader.getSelectorInfo?.(selector);
    if (selectorInfo?.name?.toLowerCase().includes(functionName.toLowerCase())) return true;
  }

  return false;
}

/**
 * Check if data contains a known selector anywhere (for nested calls)
 */
function containsSelector(data, functionName) {
  if (!data) return false;
  const lowerData = data.toLowerCase();

  if (window.registryLoader) {
    const selector = window.registryLoader.getSelectorByName?.(functionName);
    if (selector) {
      // Remove 0x prefix for search
      const selectorWithout0x = selector.slice(2).toLowerCase();
      return lowerData.includes(selectorWithout0x);
    }
  }

  return false;
}

// =============================================================================
// ADDRESS FILTERING UTILITIES - Configurable address validation
// =============================================================================

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Check if an address is valid (not a zero address or ABI offset)
 * Uses configurable patterns instead of hardcoded checks
 */
function isValidTokenAddress(addr) {
  if (!addr || addr.length !== 42) return false;
  const lowerAddr = addr.toLowerCase();

  // Exclude zero address
  if (lowerAddr === ZERO_ADDRESS.toLowerCase()) return false;

  // Exclude ABI offset patterns (small values encoded as addresses)
  // These are typically values like 0x000...0020, 0x000...0040, etc.
  if (/^0x0{24}[0-9a-f]{1,16}$/i.test(addr)) return false;

  // Must have some non-zero content in the address portion
  const addressPart = addr.slice(2);
  const nonZeroChars = addressPart.replace(/0/g, '');
  if (nonZeroChars.length < 4) return false;

  return true;
}

/**
 * Extract valid addresses from hex data
 * Looks for 32-byte slots that contain properly padded addresses
 */
function extractAddressesFromData(data) {
  const addresses = [];
  const cleanData = data.startsWith('0x') ? data.slice(2) : data;

  for (let i = 0; i < cleanData.length; i += 64) {
    const chunk = cleanData.slice(i, i + 64);
    if (chunk.length === 64 && chunk.slice(0, 24) === '000000000000000000000000') {
      const addr = '0x' + chunk.slice(24);
      if (isValidTokenAddress(addr)) {
        addresses.push(addr);
      }
    }
  }

  return addresses;
}

/**
 * Search for known token addresses in hex data using registry
 */
function findKnownTokensInData(data) {
  const foundTokens = [];
  const lowerData = data.toLowerCase();

  const knownTokens = window.registryLoader?.tokenRegistry?.tokens || {};
  for (const tokenAddr of Object.keys(knownTokens)) {
    const searchAddr = tokenAddr.slice(2).toLowerCase();
    if (lowerData.includes(searchAddr)) {
      foundTokens.push(tokenAddr);
    }
  }

  return foundTokens;
}

// =============================================================================
// GENERIC ABI DECODER UTILITIES - Metadata-driven parsing
// =============================================================================

/**
 * GENERIC: Get protocol metadata from registry or embedded globals
 * NO hardcoded protocol names - searches dynamically
 */
function getProtocolMetadata(protocolId) {
  // Try registry first
  const fromRegistry = window.metadataService?.getProtocolMetadata?.(protocolId);
  if (fromRegistry) return fromRegistry;

  // Try embedded metadata by exact name convention
  const embeddedByExactName = window[`${protocolId}Metadata`];
  if (embeddedByExactName) return embeddedByExactName;

  // Search all window properties for metadata objects with matching capabilities
  // This finds ANY embedded metadata without hardcoding protocol names
  for (const key of Object.keys(window)) {
    if (key.endsWith('Metadata') && typeof window[key] === 'object' && window[key] !== null) {
      const meta = window[key];
      // Check if this metadata has the structure we need
      if (meta.parsing?.multiSendStructure || meta.context?.contract?.abi) {
        return meta;
      }
    }
  }

  return null;
}


/**
 * Get type size in bytes for ABI types
 * @param {string} type - Solidity type (e.g., 'uint8', 'address', 'uint256')
 * @returns {number} - Size in bytes
 */
function getTypeSize(type) {
  if (type === 'address') return 20;
  if (type === 'bool' || type === 'uint8' || type === 'int8') return 1;
  if (type.startsWith('uint') || type.startsWith('int')) {
    const bits = parseInt(type.replace(/[^0-9]/g, '')) || 256;
    return bits / 8;
  }
  if (type.startsWith('bytes') && !type.includes('[]')) {
    const size = parseInt(type.replace('bytes', ''));
    if (!isNaN(size)) return size;
  }
  // Dynamic types (bytes, string, arrays) return 32 for the offset pointer
  return 32;
}

/**
 * Check if a type is dynamic (variable length)
 */
function isDynamicType(type) {
  return type === 'bytes' || type === 'string' || type.endsWith('[]');
}

/**
 * Extract a field value from hex data based on field definition
 * @param {string} data - Hex data (without 0x prefix)
 * @param {number} pos - Current position in hex string
 * @param {object} field - Field definition from metadata
 * @returns {object} - { value, nextPos }
 */
function extractFieldFromData(data, pos, field) {
  const hexSize = field.size * 2; // Convert bytes to hex chars

  if (field.type === 'uint8' || field.type === 'int8') {
    const value = parseInt(data.slice(pos, pos + hexSize), 16);
    return { value, nextPos: pos + hexSize };
  }

  if (field.type === 'address') {
    const value = '0x' + data.slice(pos, pos + hexSize);
    return { value, nextPos: pos + hexSize };
  }

  if (field.type === 'uint256' || field.type === 'uint128' || field.type === 'uint64' || field.type === 'uint32') {
    const value = '0x' + data.slice(pos, pos + hexSize);
    return { value, nextPos: pos + hexSize };
  }

  if (field.type === 'bytes' && field.sizeField) {
    // Variable length bytes - size comes from another field
    const value = '0x' + data.slice(pos, pos + hexSize);
    return { value, nextPos: pos + hexSize };
  }

  // Default: extract as hex
  const value = '0x' + data.slice(pos, pos + hexSize);
  return { value, nextPos: pos + hexSize };
}

/**
 * Parse multiSend transactions using metadata-driven structure
 * @param {string} transactionsData - Raw transactions bytes (without 0x prefix)
 * @param {object} metadata - Protocol multiSend metadata
 * @returns {Array} - Parsed transactions
 */
function parseMultiSendWithMetadata(transactionsData, metadata) {
  const structure = metadata?.parsing?.multiSendStructure;
  if (!structure || !structure.fields) {
    console.error('[MultiSend] No parsing structure in metadata');
    return [];
  }

  const transactions = [];
  let pos = 0;

  while (pos < transactionsData.length) {
    // Check minimum data remaining
    const minSize = structure.fields
      .filter(f => !f.sizeField)
      .reduce((sum, f) => sum + f.size * 2, 0);

    if (pos + minSize > transactionsData.length) break;

    const tx = {};
    let currentPos = pos;

    for (const field of structure.fields) {
      if (field.sizeField) {
        // Variable length field - use size from another field
        const dataLength = tx[field.sizeField];
        if (dataLength > 0) {
          tx[field.name] = '0x' + transactionsData.slice(currentPos, currentPos + dataLength);
          currentPos += dataLength;
        } else {
          tx[field.name] = '0x';
        }
      } else {
        const result = extractFieldFromData(transactionsData, currentPos, field);
        tx[field.name] = result.value;
        currentPos = result.nextPos;

        // If this is the dataLength field, convert to hex char count
        if (field.name === 'dataLength') {
          tx.dataLength = parseInt(tx.dataLength, 16) * 2;
        }
      }
    }

    transactions.push(tx);
    pos = currentPos;
  }

  return transactions;
}

/**
 * Get operation type info from metadata
 * @param {number} operation - Operation code (0 or 1)
 * @param {object} metadata - Protocol metadata
 * @returns {object} - { name, color, description }
 */
function getOperationTypeFromMetadata(operation, metadata) {
  const opTypes = metadata?.parsing?.operationTypes;
  if (opTypes && opTypes[operation]) {
    return opTypes[operation];
  }
  // Fallback
  return { name: `Operation ${operation}`, color: '#a0aec0', description: 'Unknown operation' };
}

/**
 * GENERIC: Check if typed data matches protocol patterns using metadata
 * Works for any protocol (Safe, Uniswap Permit, etc.)
 * @param {object} typedData - EIP-712 typed data
 * @param {object} metadata - Protocol metadata
 * @returns {boolean}
 */
function isProtocolTypedData(typedData, metadata) {
  const protocolTypes = metadata?.detection?.typedDataTypes || [];
  if (!typedData?.types || protocolTypes.length === 0) return false;

  return protocolTypes.some(t => typedData.types[t]);
}


/**
 * GENERIC: Check if text contains protocol patterns using metadata
 * @param {string} text - Text content to check
 * @param {object} metadata - Protocol metadata
 * @returns {boolean}
 */
function containsProtocolPattern(text, metadata) {
  const patterns = metadata?.detection?.domPatterns || [];
  return patterns.some(p => text.includes(p));
}


/**
 * GENERIC: Get EIP-712 type structure from metadata
 * @param {object} metadata - Protocol metadata
 * @param {string} typeName - Type name to get (e.g., 'MultisigTx', 'Permit')
 * @returns {Array} - Type definition array
 */
function getTypedDataStructure(metadata, typeName = 'default') {
  return metadata?.eip712?.[typeName] || [];
}


// =============================================================================
// GENERIC PROTOCOL TRANSACTION PARSING (METADATA-DRIVEN)
// =============================================================================

/**
 * GENERIC: Parse any protocol transaction using ERC-7730 metadata
 * Works for Universal Router, Safe MultiSend, or ANY protocol with metadata
 * @param {string} txData - The transaction calldata
 * @param {string} contractAddress - The contract address
 * @param {number} chainId - The chain ID
 * @param {string|null} transactionValue - Optional transaction value
 * @returns {Promise<object>} - Parsed transaction with intent
 */
async function parseProtocolTransaction(txData, contractAddress, chainId = 1, transactionValue = null) {
  try {
    // Use the existing generic decoder that reads from ERC-7730 metadata
    const decoded = await window.decodeCalldata?.(txData, contractAddress, chainId);

    if (!decoded || !decoded.success) {
      console.log('[KaiSign] Generic decode failed, returning basic info');
      return {
        success: false,
        selector: txData?.slice(0, 10),
        intent: 'Contract interaction',
        error: decoded?.error || 'No metadata found'
      };
    }

    return {
      success: true,
      selector: decoded.selector,
      functionName: decoded.functionName,
      functionSignature: decoded.functionSignature,
      intent: decoded.intent,
      params: decoded.params,
      formatted: decoded.formatted,
      metadata: decoded.metadata
    };
  } catch (error) {
    console.error('[KaiSign] Protocol transaction parsing error:', error);
    return {
      success: false,
      selector: txData?.slice(0, 10),
      intent: 'Contract interaction',
      error: error.message
    };
  }
}

/**
 * GENERIC: Get command/operation info from registry
 * Works for Universal Router commands, Safe operations, or any protocol
 * @param {number|string} commandByte - The command byte or operation code
 * @param {string} protocolId - Optional protocol identifier for registry lookup
 */
function getCommandInfo(commandByte, protocolId = null) {
  // Use registry loader for command lookup
  if (window.registryLoader) {
    const info = window.registryLoader.getCommandInfo?.(commandByte);
    if (info) return info;
  }

  // Fallback for unknown commands
  const byteHex = typeof commandByte === 'number'
    ? commandByte.toString(16).padStart(2, '0')
    : commandByte;

  return {
    name: `Command 0x${byteHex}`,
    intent: 'Unknown operation',
    category: 'unknown',
    action: 'unknown'
  };
}

/**
 * GENERIC: Format intent description using registry templates
 * @param {string} category - The operation category (swap, transfer, etc.)
 * @param {object} params - Parameters to substitute into the template
 */
function formatIntentDescription(category, params = {}) {
  // Try registry for intent template
  if (window.registryLoader?.formatIntent) {
    const formatted = window.registryLoader.formatIntent(category, params);
    if (formatted) return formatted;
  }

  // Simple fallback formatting
  if (category === 'swap' && params.fromToken && params.toToken) {
    return `Swap ${params.fromToken} to ${params.toToken}`;
  }
  if (category === 'transfer' && params.token) {
    return `Transfer ${params.token}`;
  }
  if (category === 'approval' && params.token) {
    return `Approve ${params.token}`;
  }

  return params.intent || `${category} operation`;
}

/**
 * GENERIC: Parse batched transaction data (multiSend or similar)
 * Format: multiSend(bytes transactions) where transactions contains multiple encoded operations
 * Uses metadata-driven parsing - NO hardcoded byte offsets
 * @param {string} txData - The transaction data (must be multiSend calldata)
 * @param {string} protocolId - Protocol ID for metadata lookup (loaded from ERC-7730 files)
 * @param {number} chainId - The chain ID for metadata lookups (default: 1)
 */
async function parseBatchTransaction(txData, protocolId = 'multisend', chainId = 1) {
  try {

    if (!txData || !matchesFunction(txData, 'multiSend')) {
      console.log('[KaiSign] Not a multiSend transaction');
      return null;
    }

    // Get protocol metadata using generic function
    // First try the provided protocol ID, then search all loaded metadata for batch transaction configs
    let metadata = getProtocolMetadata(protocolId);

    // If no metadata found via protocolId, try searching all loaded metadata
    if (!metadata) {
      const allMetadata = window.metadataService?.getAllProtocolMetadata?.() || {};
      for (const [id, meta] of Object.entries(allMetadata)) {
        // Check if this metadata has batch transaction configuration
        if (meta?.parsing?.multiSendStructure || meta?.parsing?.batchTransaction || meta?.display?.formats?.['multiSend(bytes)']) {
          metadata = meta;
          console.log(`[KaiSign] Found batch transaction metadata from: ${id}`);
          break;
        }
      }
    }

    // Log what we found for debugging
    if (metadata) {
      console.log('[KaiSign] Batch transaction metadata found:', {
        hasParsingMultiSend: !!metadata?.parsing?.multiSendStructure,
        hasOperationTypes: !!metadata?.parsing?.operationTypes
      });
    } else {
      console.warn(`[KaiSign] No batch transaction metadata available for ${protocolId}`);
      return null;
    }

    // Remove function selector (first 4 bytes / 10 hex chars)
    const payload = txData.slice(10);

    // Parse ABI-encoded bytes parameter (standard Solidity encoding)
    // First 32 bytes = offset to bytes data, then length, then data
    const WORD_SIZE = 64; // 32 bytes in hex
    const offset = parseInt(payload.slice(0, WORD_SIZE), 16) * 2;
    const length = parseInt(payload.slice(offset, offset + WORD_SIZE), 16) * 2;
    const transactionsData = payload.slice(offset + WORD_SIZE, offset + WORD_SIZE + length);

    console.log('[KaiSign] Batch transactions data length:', transactionsData.length);

    // Parse using metadata-driven structure
    const parsedTxs = parseMultiSendWithMetadata(transactionsData, metadata);

    // Convert to operations format
    const operations = parsedTxs.map(tx => {
      const opInfo = getOperationTypeFromMetadata(tx.operation, metadata);
      return {
        operation: tx.operation,
        operationType: opInfo.name,
        operationColor: opInfo.color,
        to: tx.to,
        value: tx.value,
        data: tx.data,
        selector: tx.data && tx.data.length >= 10 ? tx.data.slice(0, 10) : null
      };
    });

    // Log operations using metadata-driven operation names
    operations.forEach(op => {
      console.log(`[KaiSign] Extracted operation: ${op.operationType} to ${op.to} with data ${op.data.slice(0, 20)}...`);
    });

    console.log(`[KaiSign] Parsed ${operations.length} operations from batch transaction`);

    // Analyze operations to create intent (await registry loading)
    const intents = [];
    for (const op of operations) {
      if (op.selector) {
        const intent = await getOperationIntent(op, chainId);
        if (intent) intents.push(intent);
      }
    }

    const mainIntent = intents.length > 0 ? intents.join(' + ') : `Batch Transaction (${operations.length} operations)`;

    return {
      operations: operations,
      intent: mainIntent,
      type: 'batch_transaction'
    };

  } catch (error) {
    console.error('[KaiSign] Batch transaction parsing error:', error);
    return null;
  }
}

/**
 * GENERIC: Get intent for individual operation
 * Uses registry loader for selector lookups (no hardcoded values)
 * Now async to ensure registry is loaded
 */
async function getOperationIntent(operation, chainId = 1) {
  if (!operation.selector || operation.selector === '0x') return null;
  const selector = operation.selector;

  // Ensure registry is loaded before lookup
  if (window.registryLoader && !window.registryLoader.loaded) {
    console.log(`[KaiSign] Waiting for registry to load...`);
    await window.registryLoader.ensureLoaded();
  }

  // Use registry loader for selector lookup
  const selectorInfo = window.registryLoader?.getSelectorInfo(operation.selector);

  if (selectorInfo) {
    const intent = selectorInfo.intent;

    // Try to identify token for approval/transfer operations
    if (selectorInfo.category === 'approval' || selectorInfo.category === 'transfer') {
      const token = getTokenSymbol(operation.to);

      // Try to extract and format amount using ABI-aware extraction
      if (operation.data && operation.data.length >= 74 && window.formatTokenAmount) {
        try {
          // Use generic ABI-aware extraction based on function signature
          // Standard ERC-20 functions: selector(4 bytes) + address(32 bytes padded) + uint256(32 bytes)
          const SELECTOR_SIZE = 10; // 4 bytes in hex
          const WORD_SIZE = 64; // 32 bytes in hex
          const amountOffset = SELECTOR_SIZE + WORD_SIZE; // After selector and first param
          const amountHex = '0x' + operation.data.slice(amountOffset, amountOffset + WORD_SIZE);

          if (amountHex !== '0x0' && amountHex !== '0x' && amountHex.length > 3) {
            const formattedAmount = window.formatTokenAmount(amountHex, operation.to, 1);
            return `${intent} ${formattedAmount}`;
          }
        } catch (amountError) {
          console.error('[KaiSign] Error formatting amount:', amountError);
        }
      }

      return `${intent} ${token}`;
    }
    return intent;
  }

  // No selector info found in registry - try metadata service as fallback
  if (window.decodeCalldata && operation.to && operation.data) {
    try {
      const decoded = await window.decodeCalldata(operation.data, operation.to, chainId);

      if (decoded.success && decoded.intent && decoded.intent !== 'Contract interaction' && decoded.intent !== 'Unknown function') {
        return decoded.intent;
      }
    } catch (fallbackError) {
      console.warn(`[KaiSign] Metadata fallback failed:`, fallbackError.message);
    }
  }

  return 'Contract Call';
}

// Universal Router functions DELETED - use generic getCommandInfo() instead

/**
 * Enhanced token address resolution using registry loader
 * No hardcoded values - uses local-metadata/registry/tokens.json
 */
function resolveTokenSymbol(address) {
  if (!address) return null;

  // Use registry loader for token lookup
  if (window.registryLoader) {
    const info = window.registryLoader.getTokenInfo(address);
    return info?.symbol || null;
  }

  return null;
}

// NOTE: Protocol-specific parsing functions have been replaced with generic metadata-driven functions

/**
 * GENERIC: Parse input data to extract parameters
 * Works for any protocol - uses utility functions for address extraction
 */
function parseInputData(commandInfo, inputData) {
  if (!inputData || inputData.length < 10) return null;

  try {
    const category = commandInfo?.category || 'unknown';
    const data = inputData.startsWith('0x') ? inputData.slice(2) : inputData;

    // Extract addresses using utility function
    const addresses = extractAddressesFromData(data);
    const knownTokens = findKnownTokensInData(data);
    const allTokens = [...new Set([...addresses, ...knownTokens])];

    // Extract amount from second 32-byte slot if present
    let amountIn = null;
    if (data.length >= 128) {
      const amountInHex = data.slice(64, 128);
      if (amountInHex && !amountInHex.match(/^0+$/) && amountInHex !== 'f'.repeat(64)) {
        amountIn = '0x' + amountInHex;
      }
    }

    // Category-based result
    if (category === 'swap' && allTokens.length >= 2) {
      return {
        fromToken: allTokens[0],
        toToken: allTokens[1],
        fromSymbol: resolveTokenSymbol(allTokens[0]) || allTokens[0],
        toSymbol: resolveTokenSymbol(allTokens[1]) || allTokens[1],
        amountIn: amountIn,
        type: 'swap'
      };
    }

    if (['transfer', 'cleanup', 'sweep'].includes(category) && allTokens.length >= 1) {
      return {
        token: allTokens[0],
        tokenSymbol: resolveTokenSymbol(allTokens[0]) || allTokens[0],
        recipient: allTokens[1] || null,
        type: 'transfer'
      };
    }

    // Generic fallback
    if (allTokens.length > 0) {
      return {
        tokens: allTokens,
        tokenSymbols: allTokens.map(t => resolveTokenSymbol(t) || t),
        type: category || 'generic'
      };
    }

    return {
      type: category || 'unknown',
      dataLength: data.length / 2
    };
  } catch (error) {
    console.error('[parseInputData] Error:', error);
    return null;
  }
}

// Token metadata now loaded from registry (see registry-loader.js)
// Uses local-metadata/registry/tokens.json

/**
 * GENERIC: Get token symbol from address
 * Uses registry loader for lookups (no hardcoded values)
 */
function getTokenSymbol(address) {
  if (!address) return 'TOKEN';

  // Use registry loader for token lookup
  if (window.registryLoader) {
    return window.registryLoader.getTokenSymbol(address);
  }

  // Fallback if registry not loaded
  return address.slice(0, 6) + '...';
}

/**
 * Simple ETH formatter (convert hex wei to ETH)
 */
function formatEther(hexValue) {
  try {
    if (!hexValue || hexValue === '0x0') return '0';
    const wei = BigInt(hexValue);
    const eth = Number(wei) / 1e18;
    return eth > 0.001 ? eth.toFixed(4) : eth.toExponential(2);
  } catch {
    return hexValue;
  }
}

// NOTE: All intent extraction is now handled by parseProtocolTransaction() using ERC-7730 metadata

/**
 * Get function name from selector
 * Uses registry loader for lookups (no hardcoded values)
 */
function getFunctionNameFromSelector(selector) {
  // Use registry loader for selector lookup
  if (window.registryLoader) {
    return window.registryLoader.getFunctionName(selector);
  }

  return 'unknown';
}

// Wallet detection and hooking
const hookedWallets = new Set();

// =============================================================================
// GENERIC PROTOCOL DETECTION (METADATA-DRIVEN - NO PROTOCOL-SPECIFIC CODE)
// =============================================================================

// NOTE: Protocol-specific functions have been removed
// All transaction parsing is now done via generic parseProtocolTransaction() using ERC-7730 metadata

// Wait for any wallet
function waitForWallets() {
  // Check for different wallet providers
  detectAndHookWallets();

  // Keep checking for new wallets (some load late)
  setTimeout(waitForWallets, 500);
}

// Detect and hook various wallets
function detectAndHookWallets() {
  // 1. MetaMask (window.ethereum)
  if (window.ethereum && window.ethereum.request && !hookedWallets.has('ethereum')) {
    hookWalletProvider(window.ethereum, 'ethereum');
    hookedWallets.add('ethereum');
  }
  
  // 2. Rabby (window.rabby)
  if (window.rabby && window.rabby.request && !hookedWallets.has('rabby')) {
    hookWalletProvider(window.rabby, 'rabby');
    hookedWallets.add('rabby');
  }
  
  // 3. Coinbase Wallet (window.coinbaseWalletExtension)
  if (window.coinbaseWalletExtension && window.coinbaseWalletExtension.request && !hookedWallets.has('coinbase')) {
    hookWalletProvider(window.coinbaseWalletExtension, 'coinbase');
    hookedWallets.add('coinbase');
  }
  
  // 4. Trust Wallet (window.trustWallet)
  if (window.trustWallet && window.trustWallet.request && !hookedWallets.has('trust')) {
    hookWalletProvider(window.trustWallet, 'trust');
    hookedWallets.add('trust');
  }
  
  // 5. Phantom (window.phantom?.ethereum)
  if (window.phantom?.ethereum && window.phantom.ethereum.request && !hookedWallets.has('phantom')) {
    hookWalletProvider(window.phantom.ethereum, 'phantom');
    hookedWallets.add('phantom');
  }
  
  // 6. Check for multiple providers (some wallets inject arrays)
  if (window.ethereum?.providers && Array.isArray(window.ethereum.providers)) {
    window.ethereum.providers.forEach((provider, index) => {
      const walletKey = `provider-${index}`;
      if (provider.request && !hookedWallets.has(walletKey)) {
        const walletName = getWalletName(provider);
        hookWalletProvider(provider, walletKey, walletName);
        hookedWallets.add(walletKey);
      }
    });
  }

  // NOTE: All wallet providers are hooked generically above
  // Protocol-specific detection functions have been removed
}

// Get wallet name from provider
function getWalletName(provider) {
  if (provider.isMetaMask) return 'MetaMask';
  if (provider.isRabby) return 'Rabby';
  if (provider.isCoinbaseWallet) return 'Coinbase';
  if (provider.isTrust) return 'Trust';
  if (provider.isPhantom) return 'Phantom';
  if (provider.isBraveWallet) return 'Brave';
  if (provider.isExodus) return 'Exodus';
  if (provider.isSafe) return 'Safe Wallet';
  return 'Unknown Wallet';
}

/**
 * GENERIC: Handle typed data signature requests (EIP-712)
 * Works for any protocol with EIP-712 typed data (multisig, permits, etc.)
 * Reads protocol configuration from ERC-7730 metadata
 */
async function handleTypedDataSignature(typedData, signerAddress, walletName) {
  try {
    console.log('[KaiSign] Processing EIP-712 signature request');

    // Detect protocol from typed data structure using metadata
    const protocolInfo = detectProtocolFromTypedData(typedData);

    // Extract transaction data if present in typed data
    const txData = extractTxFromTypedData(typedData, protocolInfo);

    if (txData && txData.data) {
      // Parse the embedded transaction using generic protocol parser
      const chainId = typedData?.domain?.chainId || 1;
      const decoded = await parseProtocolTransaction(txData.data, txData.to, chainId, txData.value);

      // Build context for display
      const context = {
        isTypedDataSignature: true,
        protocolId: protocolInfo?.id || 'unknown',
        protocolName: protocolInfo?.name || 'Protocol',
        signerAddress: signerAddress,
        domain: typedData?.domain
      };

      // Show transaction info with parsed intent
      const intent = decoded?.intent || 'Signature Request - parsing...';
      getIntentAndShow(txData, 'eth_signTypedData_v4', walletName, context);
    } else {
      // No embedded transaction - show typed data structure info
      console.log('[KaiSign] No embedded transaction in typed data');
      showTypedDataInfo(typedData, signerAddress, walletName);
    }
  } catch (error) {
    console.error('[KaiSign] Error handling typed data signature:', error);
  }
}

/**
 * GENERIC: Detect protocol from EIP-712 typed data structure
 * Uses metadata to identify protocol by type names
 */
function detectProtocolFromTypedData(typedData) {
  const types = typedData?.types || {};
  const typeNames = Object.keys(types).filter(t => t !== 'EIP712Domain');

  // Check metadata for protocol with matching type definitions
  const allMetadata = window.metadataService?.getAllProtocolMetadata?.() || {};

  for (const [protocolId, metadata] of Object.entries(allMetadata)) {
    const typedDataConfig = metadata?.typedData || metadata?.display?.typedData;
    if (typedDataConfig?.primaryType && typeNames.includes(typedDataConfig.primaryType)) {
      return { id: protocolId, name: metadata.name || protocolId, config: typedDataConfig };
    }
  }

  // Fallback: detect by common type patterns (no protocol-specific hardcoding)
  // Check for multisig-related type names
  const multisigPatterns = ['multisig', 'safetx', 'gnosis', 'multisend'];
  if (typeNames.some(t => multisigPatterns.some(p => t.toLowerCase().includes(p)))) {
    return { id: 'multisig', name: 'Multisig Wallet' };
  }
  if (typeNames.some(t => t.toLowerCase().includes('permit'))) {
    return { id: 'permit', name: 'Token Permit' };
  }

  return { id: 'eip712', name: 'EIP-712 Signature' };
}

/**
 * GENERIC: Extract transaction data from typed data message
 */
function extractTxFromTypedData(typedData, protocolInfo) {
  const message = typedData?.message;
  if (!message) return null;

  // Common patterns for embedded transaction data
  return {
    to: message.to || message.target || message.recipient,
    value: message.value || message.amount || '0',
    data: message.data || message.callData || message.input || '0x',
    operation: message.operation
  };
}

/**
 * GENERIC: Show typed data info when no embedded transaction
 */
function showTypedDataInfo(typedData, signerAddress, walletName) {
  const domain = typedData?.domain || {};
  const primaryType = typedData?.primaryType || 'Unknown';

  console.log(`[KaiSign] Typed data signature: ${primaryType}`);
  console.log(`[KaiSign] Domain: ${domain.name || 'Unknown'} on chain ${domain.chainId || 'unknown'}`);

  // Show generic signature notification
  const message = typedData?.message || {};
  showEnhancedTransactionInfo(
    { to: domain.verifyingContract, data: '0x', value: '0' },
    'eth_signTypedData_v4',
    `${primaryType} Signature Request`,
    walletName,
    { success: true, functionName: primaryType, intent: `Sign ${primaryType}` },
    []
  );
}

/**
 * RPC Method Classification and Handling
 */

// Define all monitored Ethereum RPC methods
const ETHEREUM_RPC_METHODS = {
  // Transaction methods
  TRANSACTION: [
    'eth_sendTransaction',
    'eth_signTransaction', 
    'eth_sendRawTransaction',
    'eth_signTypedData_v4',
    'personal_sign'
  ],
  
  // Query methods - read blockchain state
  QUERY: [
    'eth_call',                 // Smart contract calls
    'eth_getBalance',           // Address balances
    'eth_getCode',              // Contract code
    'eth_getTransactionReceipt', // Transaction receipts
    'eth_getLogs',              // Event logs
    'eth_getTransactionByHash', // Transaction details
    'eth_getBlockByNumber',     // Block details
    'eth_getBlockByHash'        // Block details by hash
  ],
  
  // Network info methods
  NETWORK: [
    'eth_blockNumber',          // Latest block number
    'eth_chainId',              // Network chain ID
    'eth_gasPrice',             // Current gas price
    'eth_feeHistory',           // Fee history for EIP-1559
    'net_version',              // Network version
    'web3_clientVersion'        // Client version
  ],
  
  // Gas estimation methods
  GAS: [
    'eth_estimateGas',          // Gas estimation
    'eth_maxPriorityFeePerGas', // EIP-1559 priority fee
    'eth_gasPrice'              // Legacy gas price
  ],
  
  // Real-time subscription methods
  SUBSCRIPTION: [
    'eth_subscribe',            // Subscribe to events
    'eth_unsubscribe'           // Unsubscribe from events
  ],
  
  // Account methods
  ACCOUNT: [
    'eth_accounts',             // Get accounts
    'eth_requestAccounts',      // Request account access
    'wallet_addEthereumChain',  // Add custom chain
    'wallet_switchEthereumChain' // Switch chains
  ],
  
  // Wallet extension methods (snaps, plugins, custom methods)
  WALLET_EXTENSIONS: [
    'wallet_invokeSnap',        // Snap invocation (MetaMask Snaps)
    'wallet_requestSnaps',      // Request Snap permissions
    'wallet_getSnaps',          // Get installed snaps
    'wallet_registerOnboarding', // Wallet onboarding
    'wallet_watchAsset'         // Add custom token
  ]
};

// RPC activity tracking
const rpcActivity = {
  methods: {},
  timeline: [],
  patterns: {},
  security: {
    suspiciousActivity: [],
    privacyConcerns: [],
    mevIndicators: []
  }
};

/**
 * Check if a method should be monitored
 */
function isMonitoredEthereumMethod(method) {
  return Object.values(ETHEREUM_RPC_METHODS).flat().includes(method);
}

/**
 * Check if method is transaction-related
 */
function isTransactionMethod(method) {
  return ETHEREUM_RPC_METHODS.TRANSACTION.includes(method);
}

/**
 * Get method category
 */
function getMethodCategory(method) {
  for (const [category, methods] of Object.entries(ETHEREUM_RPC_METHODS)) {
    if (methods.includes(method)) {
      return category.toLowerCase();
    }
  }
  return 'unknown';
}

/**
 * Handle non-transaction RPC methods
 */
function handleRpcMethod(method, params, walletName) {
  const timestamp = Date.now();
  const category = getMethodCategory(method);
  
  // Track method frequency
  if (!rpcActivity.methods[method]) {
    rpcActivity.methods[method] = { count: 0, lastCalled: null, category };
  }
  rpcActivity.methods[method].count++;
  rpcActivity.methods[method].lastCalled = timestamp;
  
  // Add to timeline
  rpcActivity.timeline.unshift({
    method,
    category,
    params,
    walletName,
    timestamp,
    time: new Date().toISOString()
  });
  
  // Keep timeline manageable
  if (rpcActivity.timeline.length > 100) {
    rpcActivity.timeline.splice(100);
  }
  
  // Analyze patterns and security implications
  analyzeRpcPatterns(method, params, category, timestamp);
  
  // Show RPC activity notification for important methods
  if (shouldShowRpcNotification(method, category)) {
    showRpcActivityNotification(method, params, category, walletName);
  }
  
}

/**
 * Analyze RPC patterns for security and privacy concerns
 */
function analyzeRpcPatterns(method, params, category, timestamp) {
  // Detect excessive balance checking (privacy concern)
  if (method === 'eth_getBalance') {
    const recentBalanceChecks = rpcActivity.timeline.filter(
      activity => activity.method === 'eth_getBalance' && 
      timestamp - activity.timestamp < 60000 // Last 1 minute
    ).length;
    
    if (recentBalanceChecks > 10) {
      rpcActivity.security.privacyConcerns.push({
        type: 'excessive_balance_checking',
        count: recentBalanceChecks,
        timestamp,
        addresses: params?.[0] ? [params[0]] : []
      });
    }
  }
  
  // Detect rapid gas price checking (MEV indicator)
  if (method === 'eth_gasPrice' || method === 'eth_feeHistory') {
    const recentGasChecks = rpcActivity.timeline.filter(
      activity => (activity.method === 'eth_gasPrice' || activity.method === 'eth_feeHistory') &&
      timestamp - activity.timestamp < 10000 // Last 10 seconds
    ).length;
    
    if (recentGasChecks > 5) {
      rpcActivity.security.mevIndicators.push({
        type: 'rapid_gas_monitoring',
        count: recentGasChecks,
        timestamp,
        pattern: 'potential_mev_activity'
      });
    }
  }
  
  // Detect rapid block monitoring (frontrunning indicator)
  if (method === 'eth_blockNumber') {
    const recentBlockChecks = rpcActivity.timeline.filter(
      activity => activity.method === 'eth_blockNumber' &&
      timestamp - activity.timestamp < 5000 // Last 5 seconds
    ).length;
    
    if (recentBlockChecks > 3) {
      rpcActivity.security.mevIndicators.push({
        type: 'rapid_block_monitoring',
        count: recentBlockChecks,
        timestamp,
        pattern: 'potential_frontrunning'
      });
    }
  }
  
  // Detect contract discovery patterns
  if (method === 'eth_getCode') {
    const address = params?.[0];
    if (address) {
      const codeChecks = rpcActivity.timeline.filter(
        activity => activity.method === 'eth_getCode'
      ).length;
      
      if (codeChecks > 20) {
        rpcActivity.security.suspiciousActivity.push({
          type: 'extensive_contract_discovery',
          count: codeChecks,
          timestamp,
          addresses: [address]
        });
      }
    }
  }
}

/**
 * Determine if RPC method should show notification
 */
function shouldShowRpcNotification(method, category) {
  // Show notifications for important methods
  const importantMethods = [
    'wallet_addEthereumChain',
    'wallet_switchEthereumChain',
    'eth_requestAccounts',
    'eth_subscribe',
    'eth_sendRawTransaction'
  ];
  
  return importantMethods.includes(method);
}

/**
 * Show RPC activity notification
 */
function showRpcActivityNotification(method, params, category, walletName) {
  // Create notification popup
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    left: 20px;
    width: 300px;
    background: #1a202c;
    color: white;
    padding: 12px;
    border-radius: 8px;
    z-index: 999998;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
    border-left: 4px solid #3182ce;
  `;
  
  // Format method description - use registry for method descriptions
  const getMethodDescription = (method) => {
    const desc = window.registryLoader?.getMethodDescription?.(method);
    if (desc) return desc;
    // Fallback to readable method name without hardcoded emojis
    const methodParts = method.split('_');
    return methodParts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  };

  const description = getMethodDescription(method);
  
  notification.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
      <strong style="color: #63b3ed;">KaiSign RPC Monitor</strong>
      <button onclick="this.parentElement.parentElement.remove()" style="
        background: #e53e3e;
        color: white;
        border: none;
        padding: 2px 6px;
        border-radius: 3px;
        cursor: pointer;
        font-size: 9px;
      ">✕</button>
    </div>
    <div style="color: #68d391; margin-bottom: 4px;">
      ${description}
    </div>
    <div style="font-size: 10px; color: #a0aec0;">
      Wallet: ${walletName} | Category: ${category}
    </div>
    ${params && params.length > 0 ? `
      <div style="margin-top: 6px; padding: 6px; background: #000; border-radius: 3px; font-size: 9px; max-height: 60px; overflow-y: auto;">
        ${JSON.stringify(params, null, 1).slice(0, 200)}${JSON.stringify(params).length > 200 ? '...' : ''}
      </div>
    ` : ''}
  `;
  
  document.body.appendChild(notification);
  
  // Auto-remove after 8 seconds
  setTimeout(() => {
    if (notification.parentNode) notification.remove();
  }, 8000);
}

// Generic wallet provider hooker
function hookWalletProvider(provider, walletKey, walletName = walletKey) {
  if (!provider.request) return;
  
  const originalRequest = provider.request.bind(provider);
  
  provider.request = async function(args) {
    
    // Check if it's any Ethereum RPC method we want to monitor
    if (isMonitoredEthereumMethod(args.method)) {
      
      console.log(`[KaiSign] Intercepted ${args.method} from ${walletName}`, args.params);
      
      // Handle different method categories
      if (isTransactionMethod(args.method)) {
        // Transaction and signature methods
        if (args.method === 'eth_signTypedData_v4') {
          // Handle EIP-712 typed data signature requests
          const typedDataRaw = args.params?.[1];
          const address = args.params?.[0];
          
          if (typedDataRaw) {
            // Parse JSON string if needed
            let typedData;
            try {
              typedData = typeof typedDataRaw === 'string' ? JSON.parse(typedDataRaw) : typedDataRaw;
              console.log('[KaiSign] Parsed typedData:', { hasTypes: !!typedData.types, primaryType: typedData.primaryType });
            } catch (e) {
              console.error('[KaiSign] Failed to parse typedData:', e);
              typedData = typedDataRaw;
            }
            
            handleTypedDataSignature(typedData, address, walletName);
          }
        } else if (args.method === 'personal_sign') {
          // Handle personal message signing
          const message = args.params?.[0];
          const address = args.params?.[1];
          console.log('[KaiSign] Processing personal_sign request:', message);
          handleRpcMethod(args.method, args.params, walletName);
        } else {
          // Handle regular transactions (eth_sendTransaction, eth_signTransaction)
          const tx = args.params?.[0] || {};
          getIntentAndShow(tx, args.method, walletName, null);
        }
      } else {
        // Handle all other RPC methods (queries, utilities, etc.)
        handleRpcMethod(args.method, args.params, walletName);
      }
    }
    
    // Call original wallet request
    return await originalRequest(args);
  };
  
}

// Get intent and show transaction
async function getIntentAndShow(tx, method, walletName = 'Wallet', context = null) {
  let intent = 'Loading intent...';
  let decodedResult = null;
  let extractedBytecodes = [];
  
  // TYPED DATA SIGNATURE CONTEXT - CHECK FIRST
  if (context && context.isTypedDataSignature) {
    const protocolName = context.protocolName || 'Protocol';
    console.log(`[KaiSign] ${protocolName} signature context detected - checking transaction data`);
    intent = `${protocolName} Signature - parsing transaction...`;
    showEnhancedTransactionInfo(tx, method, intent, walletName, { success: false }, []);

    // Add protocol context to method display if multi-sig
    if (context.protocolId === 'multisig' || context.protocolName?.toLowerCase().includes('multisig')) {
      method = `${method} (Multi-Sig)`;
    }
    console.log('[KaiSign] Typed data transaction selector:', tx.data ? tx.data.slice(0, 10) : 'no data');
  }

  // =============================================================================
  // GENERIC PROTOCOL DETECTION - ALL PARSING VIA ERC-7730 METADATA
  // =============================================================================

  // BATCH TRANSACTION DETECTION (multiSend, execTransaction, execute, etc.)
  // All protocols use the same generic parsing flow
  const selector = tx.data?.slice(0, 10);

  if (tx.data && (matchesFunction(tx.data, 'execute') || matchesFunction(tx.data, 'execTransaction') || matchesFunction(tx.data, 'multiSend'))) {
    console.log('[KaiSign] Batch/Protocol transaction detected - selector:', selector);
    intent = 'Parsing transaction...';
    showEnhancedTransactionInfo(tx, method, intent, walletName, { success: false }, []);

    try {
      // Determine chainId - use mainnet (1) as default
      const chainId = context?.chainId || tx.chainId || 1;

      // GENERIC: Use ERC-7730 metadata to parse ANY protocol transaction
      // Try recursive decoder first for full nested intent resolution
      let decoded;
      if (window.decodeCalldataRecursive) {
        console.log('[KaiSign] Using recursive calldata decoder');
        decoded = await window.decodeCalldataRecursive(tx.data, tx.to, chainId);
      } else {
        // Fallback to non-recursive decoder
        decoded = await parseProtocolTransaction(tx.data, tx.to, chainId, tx.value);
      }

      if (decoded && decoded.success) {
        // Use aggregated intent if available (includes nested intents)
        intent = decoded.aggregatedIntent || decoded.intent || 'Contract interaction';
        decodedResult = {
          success: true,
          functionName: decoded.functionName || 'Protocol Transaction',
          selector: selector,
          intent: intent,
          protocolTransaction: true,
          nestedIntents: decoded.nestedIntents || [],
          ...decoded
        };

        // LOG RAW NESTED DECODES - NO FLATTENING
        if (decoded.nestedDecodes && decoded.nestedDecodes.length > 0) {
          console.log('[KaiSign] RAW nestedDecodes from recursive decoder:', JSON.stringify(decoded.nestedDecodes, null, 2));
          // BYPASS flattenNestedDecodes - just log raw data
          extractedBytecodes = [];
        }

        // If this is a batch transaction (multiSend), also extract operations
        // Protocol ID is determined from contract address via metadata service
        if (matchesFunction(tx.data, 'multiSend')) {
          const protocolId = window.metadataService?.getProtocolIdBySelector?.(selector) || 'multisend';
          const batchResult = await parseBatchTransaction(tx.data, protocolId, chainId);
          if (batchResult && batchResult.operations) {
            // Merge with recursive decode results if not already present
            if (extractedBytecodes.length === 0) {
              extractedBytecodes = await Promise.all(batchResult.operations.map(async (op, i) => ({
                bytecode: op.data,
                selector: op.selector,
                depth: 2,
                index: i + 1,
                target: op.to,
                functionName: `Operation ${i + 1}`,
                intent: await getOperationIntent(op, chainId),
                type: 'batch_operation',
                value: op.value !== '0x0' ? op.value : null
              })));
            }
            intent = batchResult.intent || intent;
            decodedResult.operations = batchResult.operations.length;
          }
        }

        // If execTransaction contains embedded multiSend, extract it
        if (matchesFunction(tx.data, 'execTransaction') && containsSelector(tx.data, 'multiSend')) {
          const multiSendSelector = getKnownSelector('multiSend');
          if (multiSendSelector) {
            const lowerData = tx.data.toLowerCase();
            const selectorPattern = multiSendSelector.slice(2).toLowerCase();
            const multiSendIndex = lowerData.indexOf(selectorPattern);

            if (multiSendIndex !== -1 && multiSendIndex % 2 === 0) {
              const embeddedMultiSend = '0x' + tx.data.slice(multiSendIndex);
              if (matchesFunction(embeddedMultiSend, 'multiSend')) {
                const protocolId = window.metadataService?.getProtocolIdBySelector?.(multiSendSelector) || 'multisend';
                const batchResult = await parseBatchTransaction(embeddedMultiSend, protocolId, chainId);
                if (batchResult && batchResult.operations) {
                  // Merge with recursive decode results if not already present
                  if (extractedBytecodes.length === 0) {
                    extractedBytecodes = await Promise.all(batchResult.operations.map(async (op, i) => ({
                      bytecode: op.data,
                      selector: op.selector,
                      depth: 2,
                      index: i + 1,
                      target: op.to,
                      functionName: `Operation ${i + 1}`,
                      intent: await getOperationIntent(op, chainId),
                      type: 'batch_operation',
                      value: op.value !== '0x0' ? op.value : null
                    })));
                  }
                  intent = batchResult.intent || intent;
                  decodedResult.operations = batchResult.operations.length;
                }
              }
            }
          }
        }

        console.log(`[KaiSign] Protocol transaction: ${intent}`);
        showEnhancedTransactionInfo(tx, method, intent, walletName, decodedResult, extractedBytecodes);
        return; // Skip other decoding
      }
    } catch (protocolError) {
      console.error('[KaiSign] Protocol transaction parsing error:', protocolError);
    }
  }
  
  // Show popup immediately with loading state for other transactions
  showEnhancedTransactionInfo(tx, method, intent, walletName, decodedResult, extractedBytecodes);
  
  // Use EXACT decoder from Snaps repo

  if (window.decodeCalldata && tx.data && tx.to) {
    try {
      // Get chainId from transaction context or window.ethereum
      let chainId = tx.chainId || context?.chainId;
      if (!chainId && window.ethereum?.chainId) {
        chainId = parseInt(window.ethereum.chainId, 16);
      }
      chainId = chainId || 1; // Default to mainnet if unknown

      const decoded = await window.decodeCalldata(tx.data, tx.to, chainId);
      
      // Try to extract nested bytecodes using enhanced decoder
      if (window.extractNestedBytecodes) {
        try {
          extractedBytecodes = await window.extractNestedBytecodes(tx.data, tx.to, chainId);
        } catch (error) {
        }
      }
      
      if (decoded.success) {
        intent = decoded.intent || 'Contract interaction';
        decodedResult = decoded;

        // Enhance intent with formatted token amounts
        if (decoded.params && window.formatTokenAmount) {
          try {
            // Look for amount/value parameters
            for (const [key, value] of Object.entries(decoded.params)) {
              const keyLower = key.toLowerCase();
              if ((keyLower.includes('amount') || keyLower.includes('value')) && value && value !== '0x0') {
                // Try to find token address from params or use contract address
                const tokenAddress = decoded.params.token || decoded.params.asset || decoded.params.tokenAddress || tx.to;
                if (tokenAddress) {
                  const formattedAmount = window.formatTokenAmount(value, tokenAddress, chainId);
                  // Append amount to intent if not already there
                  if (!intent.includes(formattedAmount) && !intent.toLowerCase().includes('amount')) {
                    intent = `${intent} (${formattedAmount})`;
                  }
                }
                break; // Only format first amount found
              }
            }
          } catch (amountError) {
            console.error('[KaiSign] Error formatting amount in intent:', amountError);
          }
        }
      } else {
        intent = 'Contract interaction';
        decodedResult = decoded;
      }
      // Update popup with enhanced data
      showEnhancedTransactionInfo(tx, method, intent, walletName, decodedResult, extractedBytecodes);
    } catch (error) {
      intent = 'Contract interaction';
      decodedResult = { success: false, error: error.message };
      showEnhancedTransactionInfo(tx, method, intent, walletName, decodedResult, extractedBytecodes);
    }
  } else {
    showEnhancedTransactionInfo(tx, method, intent, walletName, null, []);
  }
}

// Show enhanced transaction info with complete bytecode data
async function showEnhancedTransactionInfo(tx, method, intent, walletName = 'Wallet', decodedResult = null, extractedBytecodes = []) {
  console.log('[KaiSign] showEnhancedTransactionInfo called:', { method, intent, walletName });

  // Save transaction via bridge script (MAIN → ISOLATED → background)
  try {
    const transactionData = {
      id: Date.now().toString(),
      method: method,
      time: new Date().toISOString(),
      to: tx.to,
      value: tx.value,
      data: tx.data,
      intent: intent,
      decodedResult: decodedResult,
      extractedBytecodes: extractedBytecodes
    };

    // Send to ISOLATED world bridge script via postMessage
    window.postMessage({
      type: 'KAISIGN_SAVE_TX',
      data: transactionData
    }, '*');

    console.log('[KaiSign] Transaction sent to bridge for saving');
  } catch (error) {
    console.error('[KaiSign] Error sending transaction to bridge:', error);
  }

  // Remove old popup if exists
  const old = document.getElementById('kaisign-popup');
  if (old) old.remove();

  // Try to use advanced decoder for ANY transaction if available
  let realExtractedBytecodes = extractedBytecodes;
  let advancedDecodingResult = null;

  if (tx.data && tx.data.length > 10 && window.AdvancedTransactionDecoder) {
    try {
      const decoder = new window.AdvancedTransactionDecoder();
      advancedDecodingResult = await decoder.decodeTransaction(tx, tx.to, 1);

      if (advancedDecodingResult && advancedDecodingResult.extractedBytecodes) {
        realExtractedBytecodes = advancedDecodingResult.extractedBytecodes;
      }
    } catch (error) {
      // Use generic approach for ANY bytecode that might contain nested calls
      if (tx.data && tx.data.length > 10) {
        try {
          realExtractedBytecodes = await parseGenericNestedBytecode(tx.data);
        } catch (genericError) {
        }
      }
    }
  }

  // Create enhanced popup using CSS classes
  const popup = document.createElement('div');
  popup.id = 'kaisign-popup';
  popup.className = 'kaisign-popup';

  // Helper to escape HTML
  const escapeHtml = (str) => {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  // Helper to truncate address
  const truncateAddress = (addr) => {
    if (!addr || addr.length < 12) return addr || 'N/A';
    return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
  };

  const bytecodeSection = tx.data ? `
    <div class="kaisign-section">
      <div class="kaisign-section-header">
        <span class="kaisign-section-title">Complete Bytecode Data</span>
        <button class="kaisign-copy-btn" onclick="copyToClipboard('${escapeHtml(tx.data)}', this)">Copy All</button>
      </div>
      <div class="kaisign-bytecode">${escapeHtml(tx.data)}</div>
      <div class="kaisign-bytecode-info">
        Length: ${tx.data.length} chars | Selector: ${tx.data.slice(0, 10)}
      </div>
    </div>
  ` : '';

  // Show all nested calls - NO COMPRESSION
  const extractedSection = extractedBytecodes.length > 0 ? `
    <div class="kaisign-section purple">
      <div class="kaisign-section-header">
        <span class="kaisign-section-title purple">Nested Calls (${extractedBytecodes.length} RAW)</span>
      </div>
      ${generateBytecodeTree(extractedBytecodes)}
    </div>
  ` : '';

  const decodingSection = decodedResult ? `
    <div class="kaisign-section ${decodedResult.success ? 'success' : 'error'}">
      <div class="kaisign-section-header">
        <span class="kaisign-section-title ${decodedResult.success ? 'green' : 'red'}">Decoding Result</span>
      </div>
      <div class="kaisign-decode-result">
        ${decodedResult.success ?
          `<div class="kaisign-decode-success">Success</div>
           <div class="kaisign-decode-detail">Function: ${escapeHtml(decodedResult.functionName || 'Unknown')}</div>
           <div class="kaisign-decode-detail">Selector: ${escapeHtml(decodedResult.selector)}</div>` :
          `<div class="kaisign-decode-error">Failed: ${escapeHtml(decodedResult.error)}</div>`
        }
      </div>
    </div>
  ` : '';

  popup.innerHTML = `
    <div class="kaisign-warning">
      DEMONSTRATION VERSION - USE AT YOUR OWN RISK
    </div>

    <div class="kaisign-popup-header">
      <div class="kaisign-popup-logo">
        <span class="kaisign-popup-logo-icon">KS</span>
        <div>
          <div class="kaisign-popup-title">KaiSign Analysis</div>
          <div class="kaisign-popup-subtitle">${escapeHtml(walletName)} | ${escapeHtml(method)}</div>
        </div>
      </div>
      <button class="kaisign-close-btn" onclick="this.closest('.kaisign-popup').remove()">✕</button>
    </div>

    <div class="kaisign-intent-section">
      <div class="kaisign-intent">${escapeHtml(intent || 'Analyzing transaction...')}</div>
      <div class="kaisign-details-grid">
        <div class="kaisign-detail-item">
          <span class="kaisign-detail-label">To: </span>
          <span class="kaisign-detail-value">${truncateAddress(tx.to)}</span>
        </div>
        <div class="kaisign-detail-item">
          <span class="kaisign-detail-label">Value: </span>
          <span class="kaisign-detail-value">${escapeHtml(tx.value || '0x0')}</span>
        </div>
      </div>
    </div>

    <div class="kaisign-popup-content">
      ${bytecodeSection}
      ${extractedSection}
      ${decodingSection}
    </div>

    <div class="kaisign-action-bar">
      <button class="kaisign-btn kaisign-btn-primary" onclick="showTransactionHistory()">History</button>
      <button class="kaisign-btn kaisign-btn-secondary" onclick="exportTransactionData('${escapeHtml(tx.data)}', ${JSON.stringify(JSON.stringify({decodedResult, extractedBytecodes}))})">Export</button>
      <button class="kaisign-btn kaisign-btn-purple" onclick="showRpcDashboard()">RPC Activity</button>
    </div>
  `;

  document.body.appendChild(popup);

  // Auto-remove after 30 seconds
  setTimeout(() => {
    if (popup.parentNode) popup.remove();
  }, 30000);
}

// Generic bytecode parser - scans for any potential nested bytecodes
async function parseGenericNestedBytecode(data) {
  const extractedCalls = [];
  
  try {
    
    // Remove function selector
    const payload = data.slice(10);
    const selector = data.slice(0, 10);
    
    // Add the main transaction as first call
    extractedCalls.push({
      bytecode: data,
      selector: selector,
      depth: 1,
      index: 0,
      target: 'Main Transaction',
      functionName: 'Transaction Root',
      type: 'root_call'
    });
    
    // Scan for potential function selectors in the payload
    // Function selectors are 4-byte patterns that appear at data boundaries
    const potentialSelectors = [];
    
    // Look for 4-byte patterns that could be function selectors
    for (let i = 0; i < payload.length - 8; i += 2) {
      const candidate = '0x' + payload.slice(i, i + 8);
      
      // Check if this looks like a function selector (not all zeros, reasonable hex)
      if (candidate !== '0x00000000' && candidate.match(/^0x[0-9a-fA-F]{8}$/)) {
        // Check if there's enough data after this to be a valid call
        const remainingData = payload.slice(i);
        if (remainingData.length >= 8) { // At least selector + some data
          potentialSelectors.push({
            position: i,
            selector: candidate,
            remainingData: '0x' + remainingData
          });
        }
      }
    }
    
    
    // Add potential nested calls (limit to avoid spam)
    let callIndex = 1;
    for (const potential of potentialSelectors.slice(0, 10)) {
      // Try to extract meaningful bytecode chunks
      let bytecodeLength = Math.min(potential.remainingData.length, 200); // Reasonable chunk size
      
      // Try to find natural boundaries (look for next potential selector)
      for (let j = 8; j < potential.remainingData.length - 8; j += 2) {
        const nextCandidate = potential.remainingData.slice(j, j + 8);
        if (nextCandidate.match(/^[0-9a-fA-F]{8}$/) && nextCandidate !== '00000000') {
          bytecodeLength = Math.min(j, 200);
          break;
        }
      }
      
      const extractedBytecode = potential.remainingData.slice(0, bytecodeLength);
      
      if (extractedBytecode.length >= 10) {
        extractedCalls.push({
          bytecode: extractedBytecode,
          selector: potential.selector,
          depth: 2,
          index: callIndex++,
          target: 'Detected Target',
          functionName: `Nested Call ${callIndex}`,
          type: 'detected_nested',
          position: potential.position
        });
      }
    }
    
  } catch (error) {
  }
  
  return extractedCalls;
}


// Helper function to generate bytecode tree structure
window.generateBytecodeTree = function(bytecodes) {
  if (!bytecodes || bytecodes.length === 0) return '';

  // LOG ALL ENTRIES TO DEBUG DUPLICATES
  console.log('[KaiSign] generateBytecodeTree received', bytecodes.length, 'entries:');
  bytecodes.forEach((bc, i) => {
    console.log(`  [${i}] selector=${bc.selector} target=${bc.target} fn=${bc.functionName} depth=${bc.depth}`);
  });

  function getDepthColor(depth) {
    const colors = ['#ffd700', '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4'];
    return colors[(depth - 1) % colors.length];
  }

  return `
    <div style="background: #1a1a2e; padding: 10px; border-radius: 6px; margin: 8px 0;">
      <div style="color: #68d391; font-size: 10px; margin-bottom: 6px; font-weight: bold;">
        📊 Call Stack (${bytecodes.length} operation${bytecodes.length > 1 ? 's' : ''})
      </div>
      ${bytecodes.map((bc, i) => {
        const depth = bc.depth || 1;
        const color = getDepthColor(depth);
        const indent = '  '.repeat(Math.max(0, depth - 1));
        const connector = depth > 1 ? '└─ ' : '';

        return `
          <div style="margin: 3px 0; padding: 4px 8px; background: #0d0d1a; border-radius: 3px; border-left: 3px solid ${color};">
            <div style="font-family: monospace; font-size: 10px;">
              <span style="color: #666;">${indent}${connector}</span>
              <span style="color: ${color}; font-weight: bold;">${bc.functionName || bc.selector || 'call'}</span>
              ${bc.target ? `<span style="color: #666;"> → ${bc.target.slice(0, 6)}...${bc.target.slice(-4)}</span>` : ''}
            </div>
            ${bc.intent ? `<div style="margin-left: ${depth * 12}px; font-size: 9px; color: #ffd700;">${bc.intent}</div>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
};

// Helper functions for enhanced popup
window.copyToClipboard = function(text, button) {
  const showCopied = () => {
    const originalText = button.textContent;
    button.textContent = 'Copied!';
    button.classList.add('copied');
    setTimeout(() => {
      button.textContent = originalText;
      button.classList.remove('copied');
    }, 2000);
  };

  navigator.clipboard.writeText(text).then(showCopied).catch(err => {
    console.error('[KaiSign] Copy failed:', err);
    // Fallback: create temporary textarea
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showCopied();
  });
};

window.showTransactionHistory = function() {
  // Get transactions from chrome.storage via background.js
  chrome.runtime.sendMessage({ type: 'GET_TRANSACTIONS' }, (response) => {
    const transactions = response?.transactions || [];

    // Remove existing modal
    const existing = document.getElementById('kaisign-history');
    if (existing) existing.remove();

    const historyPopup = document.createElement('div');
    historyPopup.id = 'kaisign-history';
    historyPopup.className = 'kaisign-modal';

    // Helper to escape HTML
    const escapeHtml = (str) => {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };

    // Helper to truncate address
    const truncateAddress = (addr) => {
      if (!addr || addr.length < 20) return addr || 'N/A';
      return `${addr.slice(0, 10)}...${addr.slice(-8)}`;
    };

    historyPopup.innerHTML = `
      <div class="kaisign-modal-header">
        <h2 class="kaisign-modal-title">Transaction History (${transactions.length})</h2>
        <div class="kaisign-modal-actions">
          <button class="kaisign-btn kaisign-btn-primary" onclick="showRpcDashboard(); this.closest('.kaisign-modal').remove();">RPC Dashboard</button>
          <button class="kaisign-close-btn" onclick="this.closest('.kaisign-modal').remove()">✕</button>
        </div>
      </div>

      <div class="kaisign-modal-content">
        ${transactions.length === 0 ?
          '<div class="kaisign-empty">No transactions recorded yet</div>' :
          transactions.map((tx, i) => `
            <div class="kaisign-history-item">
              <div class="kaisign-history-header">
                <span class="kaisign-history-intent">#${i + 1} ${escapeHtml(tx.intent || 'Unknown')}</span>
                <span class="kaisign-history-time">${tx.time ? new Date(tx.time).toLocaleString() : 'N/A'}</span>
              </div>
              <div class="kaisign-history-details">
                <div class="kaisign-history-detail"><strong>Method:</strong> ${escapeHtml(tx.method || 'N/A')}</div>
                <div class="kaisign-history-detail"><strong>To:</strong> ${truncateAddress(tx.to)}</div>
              </div>
              ${tx.data ? `
                <div class="kaisign-history-data">
                  <div class="kaisign-history-data-header">
                    <span class="kaisign-history-data-label">Bytecode Data:</span>
                    <button class="kaisign-copy-btn" onclick="copyToClipboard('${escapeHtml(tx.data)}', this)">Copy</button>
                  </div>
                  <div class="kaisign-history-data-value">${escapeHtml(tx.data)}</div>
                </div>
              ` : ''}
            </div>
          `).join('')
        }
      </div>

      <div class="kaisign-modal-footer">
        <button class="kaisign-btn kaisign-btn-secondary" onclick="chrome.runtime.sendMessage({ type: 'CLEAR_TRANSACTIONS' }, () => { this.closest('.kaisign-modal').remove(); alert('Transaction history cleared!'); });">Clear History</button>
      </div>
    `;

    document.body.appendChild(historyPopup);
  });
};

/**
 * Show comprehensive RPC activity dashboard
 */
window.showRpcDashboard = function() {
  // Remove existing dashboard
  const existing = document.getElementById('kaisign-rpc-dashboard');
  if (existing) existing.remove();

  const dashboard = document.createElement('div');
  dashboard.id = 'kaisign-rpc-dashboard';
  dashboard.className = 'kaisign-dashboard';
  
  // Generate dashboard content
  const methodsCount = Object.keys(rpcActivity.methods).length;
  const totalCalls = Object.values(rpcActivity.methods).reduce((sum, method) => sum + method.count, 0);
  const recentActivity = rpcActivity.timeline.slice(0, 10);
  
  // Category statistics
  const categoryStats = {};
  for (const [method, data] of Object.entries(rpcActivity.methods)) {
    const category = data.category;
    if (!categoryStats[category]) {
      categoryStats[category] = { count: 0, methods: [] };
    }
    categoryStats[category].count += data.count;
    categoryStats[category].methods.push(method);
  }
  
  // Security analysis
  const securityConcerns = [
    ...rpcActivity.security.privacyConcerns,
    ...rpcActivity.security.mevIndicators,
    ...rpcActivity.security.suspiciousActivity
  ];
  
  // Typed data signatures analysis (EIP-712)
  const typedDataSignatures = rpcActivity.patterns.typedDataSignatures || rpcActivity.patterns.safeSignatures || [];
  const multisigCoordination = rpcActivity.patterns.multisigCoordination || {};
  
  dashboard.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #4a5568; padding-bottom: 15px;">
      <h1 style="margin: 0; color: #63b3ed; font-size: 18px;">📊 KaiSign RPC Activity Dashboard</h1>
      <button onclick="this.parentElement.parentElement.remove()" style="
        background: #e53e3e;
        color: white;
        border: none;
        padding: 10px 15px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
      ">✕ Close</button>
    </div>
    
    <!-- Summary Statistics -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 25px;">
      <div style="background: #2d3748; padding: 15px; border-radius: 8px; border-left: 4px solid #68d391;">
        <div style="color: #68d391; font-size: 24px; font-weight: bold;">${totalCalls}</div>
        <div style="color: #a0aec0; font-size: 12px;">Total RPC Calls</div>
      </div>
      <div style="background: #2d3748; padding: 15px; border-radius: 8px; border-left: 4px solid #3182ce;">
        <div style="color: #3182ce; font-size: 24px; font-weight: bold;">${methodsCount}</div>
        <div style="color: #a0aec0; font-size: 12px;">Unique Methods</div>
      </div>
      <div style="background: #2d3748; padding: 15px; border-radius: 8px; border-left: 4px solid #f093fb;">
        <div style="color: #f093fb; font-size: 24px; font-weight: bold;">${typedDataSignatures.length}</div>
        <div style="color: #a0aec0; font-size: 12px;">EIP-712 Signatures</div>
      </div>
      <div style="background: #2d3748; padding: 15px; border-radius: 8px; border-left: 4px solid ${securityConcerns.length > 0 ? '#ff6b6b' : '#68d391'};">
        <div style="color: ${securityConcerns.length > 0 ? '#ff6b6b' : '#68d391'}; font-size: 24px; font-weight: bold;">${securityConcerns.length}</div>
        <div style="color: #a0aec0; font-size: 12px;">Security Alerts</div>
      </div>
    </div>
    
    <!-- Category Breakdown -->
    <div style="margin-bottom: 25px;">
      <h3 style="color: #ffd700; margin-bottom: 15px;">📂 Method Categories</h3>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px;">
        ${Object.entries(categoryStats).map(([category, stats]) => `
          <div style="background: #2d3748; padding: 12px; border-radius: 8px;">
            <div style="color: #63b3ed; font-weight: bold; margin-bottom: 8px;">
              ${category.toUpperCase()} (${stats.count} calls)
            </div>
            <div style="font-size: 10px; color: #a0aec0;">
              ${stats.methods.slice(0, 3).join(', ')}${stats.methods.length > 3 ? ` +${stats.methods.length - 3} more` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    
    <!-- Security Analysis -->
    ${securityConcerns.length > 0 ? `
      <div style="margin-bottom: 25px;">
        <h3 style="color: #ff6b6b; margin-bottom: 15px;">⚠️ Security Analysis</h3>
        <div style="background: #2d3748; padding: 15px; border-radius: 8px; border-left: 4px solid #ff6b6b;">
          ${securityConcerns.map((concern, i) => `
            <div style="margin-bottom: 10px; padding: 8px; background: #1a202c; border-radius: 6px;">
              <div style="color: #ff6b6b; font-weight: bold; margin-bottom: 4px;">
                ${concern.type.replace(/_/g, ' ').toUpperCase()}
              </div>
              <div style="font-size: 10px; color: #a0aec0;">
                Count: ${concern.count} | Pattern: ${concern.pattern || 'N/A'} | 
                Time: ${new Date(concern.timestamp).toLocaleTimeString()}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
    
    <!-- Multisig Activity -->
    ${Object.keys(multisigCoordination).length > 0 ? `
      <div style="margin-bottom: 25px;">
        <h3 style="color: #f093fb; margin-bottom: 15px;">🔐 Multisig Coordination</h3>
        <div style="background: #2d3748; padding: 15px; border-radius: 8px;">
          ${Object.entries(multisigCoordination).map(([contractAddress, coordination]) => `
            <div style="margin-bottom: 15px; padding: 10px; background: #1a202c; border-radius: 6px;">
              <div style="color: #f093fb; font-weight: bold; margin-bottom: 6px;">
                Contract: ${contractAddress.slice(0, 10)}...${contractAddress.slice(-8)}
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; font-size: 10px;">
                <div><strong>Signers:</strong> ${coordination.signers.size}</div>
                <div><strong>Recent Sigs:</strong> ${coordination.signatures.length}</div>
                <div><strong>Last Activity:</strong> ${new Date(coordination.lastActivity).toLocaleTimeString()}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
    
    <!-- Recent Activity Timeline -->
    <div style="margin-bottom: 25px;">
      <h3 style="color: #68d391; margin-bottom: 15px;">⏱️ Recent Activity Timeline</h3>
      <div style="background: #2d3748; padding: 15px; border-radius: 8px; max-height: 300px; overflow-y: auto;">
        ${recentActivity.length > 0 ? recentActivity.map((activity, i) => `
          <div style="margin-bottom: 12px; padding: 10px; background: #1a202c; border-radius: 6px; border-left: 3px solid #68d391;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="color: #68d391; font-weight: bold;">${activity.method}</span>
              <span style="color: #a0aec0; font-size: 10px;">${new Date(activity.timestamp).toLocaleTimeString()}</span>
            </div>
            <div style="font-size: 10px; color: #a0aec0;">
              Category: ${activity.category} | Wallet: ${activity.walletName}
              ${activity.params && activity.params.length > 0 ? `<br>Params: ${JSON.stringify(activity.params).slice(0, 100)}...` : ''}
            </div>
          </div>
        `).join('') : '<div style="color: #a0aec0; text-align: center; padding: 20px;">No recent activity</div>'}
      </div>
    </div>
    
    <!-- Method Frequency Table -->
    <div style="margin-bottom: 25px;">
      <h3 style="color: #3182ce; margin-bottom: 15px;">📈 Method Frequency</h3>
      <div style="background: #2d3748; border-radius: 8px; overflow: hidden;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead style="background: #4a5568;">
            <tr>
              <th style="padding: 10px; text-align: left; color: #fff;">Method</th>
              <th style="padding: 10px; text-align: left; color: #fff;">Category</th>
              <th style="padding: 10px; text-align: center; color: #fff;">Count</th>
              <th style="padding: 10px; text-align: left; color: #fff;">Last Called</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(rpcActivity.methods)
              .sort(([,a], [,b]) => b.count - a.count)
              .slice(0, 20)
              .map(([method, data]) => `
                <tr style="border-bottom: 1px solid #4a5568;">
                  <td style="padding: 8px; color: #63b3ed;">${method}</td>
                  <td style="padding: 8px; color: #a0aec0;">${data.category}</td>
                  <td style="padding: 8px; text-align: center; color: #68d391; font-weight: bold;">${data.count}</td>
                  <td style="padding: 8px; color: #a0aec0; font-size: 10px;">
                    ${data.lastCalled ? new Date(data.lastCalled).toLocaleString() : 'N/A'}
                  </td>
                </tr>
              `).join('')}
          </tbody>
        </table>
      </div>
    </div>
    
    <!-- Action Buttons -->
    <div style="text-align: center; padding-top: 20px; border-top: 1px solid #4a5568;">
      <button onclick="exportRpcActivity()" style="
        background: #38a169;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 11px;
        margin-right: 10px;
      ">💾 Export RPC Data</button>
      <button onclick="clearRpcActivity()" style="
        background: #e53e3e;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 11px;
      ">🗑️ Clear RPC Data</button>
    </div>
  `;
  
  document.body.appendChild(dashboard);
};

/**
 * Export RPC activity data
 */
window.exportRpcActivity = function() {
  try {
    const exportData = {
      timestamp: new Date().toISOString(),
      summary: {
        totalMethods: Object.keys(rpcActivity.methods).length,
        totalCalls: Object.values(rpcActivity.methods).reduce((sum, method) => sum + method.count, 0)
      },
      methods: rpcActivity.methods,
      timeline: rpcActivity.timeline,
      patterns: rpcActivity.patterns,
      security: rpcActivity.security
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kaisign-rpc-activity-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    alert('✅ RPC activity data exported successfully!');
  } catch (error) {
    console.error('[KaiSign] RPC export failed:', error);
    alert('❌ Export failed: ' + error.message);
  }
};

/**
 * Clear RPC activity data
 */
window.clearRpcActivity = function() {
  if (confirm('Are you sure you want to clear all RPC activity data?')) {
    // Reset all RPC activity
    rpcActivity.methods = {};
    rpcActivity.timeline = [];
    rpcActivity.patterns = {};
    rpcActivity.security = {
      suspiciousActivity: [],
      privacyConcerns: [],
      mevIndicators: []
    };
    
    // Close dashboard
    const dashboard = document.getElementById('kaisign-rpc-dashboard');
    if (dashboard) dashboard.remove();
    
    alert('✅ RPC activity data cleared!');
  }
};

window.exportTransactionData = function(calldata, analyzedData) {
  try {
    const data = {
      timestamp: new Date().toISOString(),
      calldata: calldata,
      analyzedData: JSON.parse(analyzedData)
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kaisign-transaction-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    alert('✅ Transaction data exported successfully!');
  } catch (error) {
    console.error('[KaiSign] Export failed:', error);
    alert('❌ Export failed: ' + error.message);
  }
};

// Expose functions globally for testing
window.parseProtocolTransaction = parseProtocolTransaction;  // Generic protocol parser
window.getIntentAndShow = getIntentAndShow;

// Expose RPC monitoring functions globally
window.kaisignRpc = {
  activity: rpcActivity,
  methods: ETHEREUM_RPC_METHODS,
  showDashboard: () => window.showRpcDashboard(),
  export: () => window.exportRpcActivity(),
  clear: () => window.clearRpcActivity(),
  
  // Test methods for different RPC types
  simulateMethod: (method, params, walletName = 'Test Wallet') => {
    console.log(`[KaiSign-Test] Simulating ${method}`);
    handleRpcMethod(method, params, walletName);
  },
  
  // Security analysis helpers
  getSuspiciousActivity: () => rpcActivity.security.suspiciousActivity,
  getPrivacyConcerns: () => rpcActivity.security.privacyConcerns,
  getMevIndicators: () => rpcActivity.security.mevIndicators,
  
  // Signature helpers (generic - works for any protocol)
  getSignatures: () => rpcActivity.patterns.signatures || [],
  getCoordination: () => rpcActivity.patterns.coordination || {},
  
  // Statistics
  getStats: () => ({
    totalMethods: Object.keys(rpcActivity.methods).length,
    totalCalls: Object.values(rpcActivity.methods).reduce((sum, method) => sum + method.count, 0),
    categorizedMethods: Object.entries(rpcActivity.methods).reduce((acc, [method, data]) => {
      if (!acc[data.category]) acc[data.category] = [];
      acc[data.category].push(method);
      return acc;
    }, {}),
    securityAlertsCount: [
      ...rpcActivity.security.privacyConcerns,
      ...rpcActivity.security.mevIndicators, 
      ...rpcActivity.security.suspiciousActivity
    ].length
  })
};

// Console helpers
console.log(`
🔍 KaiSign Enhanced RPC Monitor Loaded!

Now monitoring ALL Ethereum RPC methods including:
• Transaction methods (eth_sendTransaction, eth_signTypedData_v4, etc.)
• Query methods (eth_call, eth_getBalance, eth_getLogs, etc.)
• Network methods (eth_chainId, eth_blockNumber, eth_gasPrice, etc.)
• EIP-712 signature tracking
• Security & privacy pattern detection

Quick access commands:
- window.kaisignRpc.showDashboard() - Full RPC dashboard
- window.kaisignRpc.getStats() - Quick statistics
- window.kaisignRpc.activity - Raw activity data
- window.kaisignRpc.simulateMethod('eth_getBalance', ['0x123...']) - Test RPC method

Features:
✅ Generic protocol transaction parsing (ERC-7730 metadata-driven)
✅ MEV/frontrunning detection
✅ Privacy concern monitoring
✅ Comprehensive RPC call tracking
✅ Real-time security alerts
✅ Transaction history integration
`);

// Start wallet detection
waitForWallets();



