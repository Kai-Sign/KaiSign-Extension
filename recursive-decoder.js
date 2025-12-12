// Recursive Calldata Decoder - ERC-7730 compliant, metadata-driven
// NO HARDCODED SELECTORS OR PROTOCOL-SPECIFIC LOGIC
// All parsing structures come from metadata

/**
 * RecursiveCalldataDecoder - Decodes nested calldata using ERC-7730 metadata
 *
 * Handles:
 * - "type": "calldata" fields with JSONPath target resolution
 * - "type": "multicallDecoder" for packed batch transactions
 * - "type": "multicallSummary" for aggregated statistics
 * - Depth limiting to prevent infinite recursion
 * - Cycle detection
 */
class RecursiveCalldataDecoder {
  constructor(options = {}) {
    this.maxDepth = options.maxDepth || 5;
    this.decodingStack = []; // Track recursion for cycle detection
  }

  /**
   * Main entry point for recursive decoding
   * @param {string} calldata - The calldata to decode
   * @param {string} targetAddress - Contract address for metadata lookup
   * @param {number} chainId - Chain ID
   * @param {object} parentContext - Parent decoding context (for JSONPath resolution)
   * @param {number} depth - Current recursion depth
   * @returns {Promise<object>} - Decoded result with nested intents
   */
  async decode(calldata, targetAddress, chainId, parentContext = null, depth = 0) {
    // Validate calldata
    if (!calldata || calldata === '0x' || calldata.length < 10) {
      return {
        success: false,
        error: 'Invalid or empty calldata',
        rawData: calldata,
        depth
      };
    }

    const selector = calldata.slice(0, 10);

    // Depth check
    if (depth >= this.maxDepth) {
      return {
        success: false,
        error: `Max recursion depth (${this.maxDepth}) reached`,
        rawData: calldata,
        depth,
        truncated: true
      };
    }

    // Cycle detection - check if we're already decoding this exact contract+selector
    // Do NOT include depth in key - depth changes naturally in recursion
    const stackKey = `${targetAddress?.toLowerCase()}:${selector}`;
    if (this.decodingStack.includes(stackKey)) {
      console.warn(`[RecursiveDecoder] Cycle detected: ${stackKey}`);
      return {
        success: false,
        error: 'Recursive cycle detected',
        rawData: calldata,
        depth
      };
    }
    this.decodingStack.push(stackKey);

    try {
      // Use existing decodeCalldata for initial decode
      const decoded = await window.decodeCalldata(calldata, targetAddress, chainId);

      if (!decoded.success) {
        return { ...decoded, depth };
      }

      // Get metadata for this contract to check for calldata fields
      // Pass selector for proxy detection (e.g., Safe proxies)
      const metadata = await this.getMetadata(targetAddress, chainId, selector);

      // Process fields looking for nested calldata
      // Use function signature (e.g. "multicall(bytes)") if available, fallback to functionName
      const processedResult = await this.processFieldsRecursively(
        decoded.params,
        decoded.function || decoded.functionName,
        metadata,
        { params: decoded.params, parentContext, targetAddress },
        chainId,
        depth
      );

      // Aggregate intents from nested decodes
      const nestedIntents = this.aggregateIntents(processedResult);

      // Only show leaf intents in aggregated title (user preference: clean display)
      // Store wrapper intent separately for context
      const aggregatedIntent = nestedIntents.length > 0
        ? nestedIntents.join(' + ')
        : decoded.intent;

      return {
        ...decoded,
        params: processedResult.params,
        nestedDecodes: processedResult.nestedDecodes,
        nestedIntents,
        aggregatedIntent,
        wrapperIntent: decoded.intent, // Store wrapper intent separately for UI context
        depth
      };
    } finally {
      this.decodingStack.pop();
    }
  }

  /**
   * Process decoded parameters looking for calldata fields to recursively decode
   * @param {object} params - Decoded parameters
   * @param {string} functionName - Function name
   * @param {object} metadata - Contract metadata
   * @param {object} context - Current decoding context
   * @param {number} chainId - Chain ID
   * @param {number} depth - Current depth
   * @returns {Promise<{params: object, nestedDecodes: Array}>}
   */
  async processFieldsRecursively(params, functionName, metadata, context, chainId, depth) {
    const nestedDecodes = [];
    const processedParams = { ...params };

    // Get format definition for this function
    // Try exact match first, then try matching by function name (without signature)
    let format = metadata?.display?.formats?.[functionName];
    let matchedKey = functionName;

    if (!format && metadata?.display?.formats) {
      // Extract just the function name (before the parenthesis)
      const baseFunctionName = functionName.includes('(')
        ? functionName.split('(')[0]
        : functionName;

      // Try to find a matching key in metadata formats
      // 1. Exact match on base name
      // 2. Key starts with base name + "("
      const formats = metadata.display.formats;
      for (const key of Object.keys(formats)) {
        const keyBaseName = key.includes('(') ? key.split('(')[0] : key;
        if (key === baseFunctionName || keyBaseName === baseFunctionName) {
          format = formats[key];
          matchedKey = key;
          break;
        }
      }
    }

    // Debug logging (can be removed for production)
    if (!format) {
      const displayFormatKeys = metadata?.display?.formats ? Object.keys(metadata.display.formats) : [];
      console.log('[RecursiveDecoder] No format found for:', functionName.split('(')[0], 'available:', displayFormatKeys.join(', '));
    }

    if (!format) {
      return { params: processedParams, nestedDecodes };
    }

    // Find all calldata field definitions and DEDUPLICATE by path
    const calldataFieldsMap = new Map(); // Use Map to dedupe by path

    if (format.intent?.format) {
      const intentFields = [];
      this.findCalldataFields(format.intent.format, intentFields);
      for (const field of intentFields) {
        if (field.path && !calldataFieldsMap.has(field.path)) {
          calldataFieldsMap.set(field.path, field);
        }
      }
    }

    if (format.fields) {
      for (const field of format.fields) {
        if ((field.type === 'calldata' || field.format === 'calldata') && field.path) {
          // Only add if not already present
          if (!calldataFieldsMap.has(field.path)) {
            calldataFieldsMap.set(field.path, field);
          }
        }
      }
    }

    // Process UNIQUE calldata fields only
    const processedPaths = new Set();
    for (const [path, fieldDef] of calldataFieldsMap) {
      if (processedPaths.has(path)) continue;
      processedPaths.add(path);

      const pathStr = fieldDef.path;

      // Handle array paths like "calls.[].data" with parallel calleePath "calls.[].to"
      if (pathStr.includes('[]')) {
        console.log('[RecursiveDecoder] Processing array path:', pathStr);

        // Parse array path: "calls.[].data" -> arrayFieldName="calls", dataFieldName="data"
        const parts = pathStr.split('.');
        const arrayFieldName = parts[0]; // "calls"
        const dataFieldName = parts[parts.length - 1]; // "data"

        // Get calleePath for target resolution (supports params.calleePath or field.to)
        const calleePathStr = fieldDef.params?.calleePath || fieldDef.to;
        const calleeFieldName = calleePathStr?.split('.').pop(); // "to"

        const arrayData = params[arrayFieldName];
        if (Array.isArray(arrayData)) {
          console.log(`[RecursiveDecoder] Found ${arrayData.length} items in ${arrayFieldName}`);

          for (let i = 0; i < arrayData.length; i++) {
            const item = arrayData[i];
            const calldata = item[dataFieldName];
            const target = item[calleeFieldName];

            console.log(`[RecursiveDecoder] Decoding ${arrayFieldName}[${i}].${dataFieldName} → target: ${target?.slice(0, 12)}...`);

            if (calldata && calldata.length >= 10 && target) {
              const nestedResult = await this.decode(calldata, target, chainId, context, depth + 1);
              if (nestedResult.success) {
                processedParams[`${arrayFieldName}[${i}].${dataFieldName}_decoded`] = nestedResult;
                nestedDecodes.push({
                  fieldPath: `${arrayFieldName}[${i}].${dataFieldName}`,
                  targetAddress: target,
                  result: nestedResult
                });
              }
            }
          }
        }
        continue; // Skip the simple path handling below
      }

      // Simple path handling (non-array)
      const paramName = fieldDef.path;
      const rawValue = params[paramName];

      if (!rawValue || rawValue === '0x' || rawValue.length < 10) {
        continue;
      }

      // Resolve target address using JSONPath or params.calleePath
      let targetAddress = fieldDef.to || fieldDef.params?.calleePath;
      if (targetAddress?.startsWith('$.')) {
        targetAddress = window.resolveJsonPath(targetAddress, params);
      }

      if (!targetAddress) continue;

      // Recursively decode the nested calldata
      const nestedResult = await this.decode(rawValue, targetAddress, chainId, context, depth + 1);

      if (nestedResult.success) {
        processedParams[`${paramName}_decoded`] = nestedResult;
        nestedDecodes.push({
          fieldPath: paramName,
          targetAddress,
          result: nestedResult
        });
      }
    }

    // Track which paths have been processed as multicall to avoid duplicates
    const processedMulticallPaths = new Set();

    // Get multicall structure from metadata's parsing section (used by both explicit and auto-detected multicall)
    const multicallStructure = metadata?.parsing?.multicallStructure;

    // Check for multicallDecoder fields (explicit type in metadata)
    const multicallFields = this.findMulticallDecoderFields(format.intent?.format || []);
    for (const fieldDef of multicallFields) {
      const paramName = fieldDef.path;
      if (!paramName || processedMulticallPaths.has(paramName)) continue;

      const rawValue = params[paramName];
      if (!rawValue || rawValue === '0x') continue;

      processedMulticallPaths.add(paramName);

      const multicallResult = await this.handleMulticallDecoder(
        fieldDef,
        rawValue,
        context,
        chainId,
        depth,
        multicallStructure
      );

      if (multicallResult.operations?.length > 0) {
        processedParams[`${paramName}_multicall`] = multicallResult;
        nestedDecodes.push({
          fieldPath: paramName,
          type: 'multicall',
          result: multicallResult
        });
      }
    }

    // Also check format fields for multicallBatch format
    // Structure comes from metadata's parsing.multicallStructure
    const fieldsToCheck = format?.fields || [];
    for (const field of fieldsToCheck) {
      // Look for multicallBatch format or transactions field
      if (field.format === 'multicallBatch' || (field.path === 'transactions' && params.transactions)) {
        const paramName = field.path;

        // Skip if already processed
        if (processedMulticallPaths.has(paramName)) continue;

        const rawValue = params[paramName];
        if (!rawValue || rawValue === '0x' || rawValue.length < 4) continue;

        processedMulticallPaths.add(paramName);

        // Use multicall structure from metadata
        const multicallResult = await this.handleMulticallDecoder(
          { path: paramName, format: { parseNestedCalls: true } },
          rawValue,
          context,
          chainId,
          depth,
          multicallStructure
        );

        if (multicallResult.operations?.length > 0) {
          processedParams[`${paramName}_multicall`] = multicallResult;
          nestedDecodes.push({
            fieldPath: paramName,
            type: 'multicall',
            result: multicallResult
          });
        }
      }
    }

    return { params: processedParams, nestedDecodes };
  }

  /**
   * Find all calldata field definitions in format structure
   * Recursively traverses containers and nested field arrays
   * @param {Array|object} formatArray - Format array or object from metadata
   * @param {Array} results - Accumulated results
   * @returns {Array}
   */
  findCalldataFields(formatArray, results = []) {
    // Handle single object (like intent.format[0])
    if (formatArray && typeof formatArray === 'object' && !Array.isArray(formatArray)) {
      if (formatArray.type === 'calldata' && formatArray.path) {
        results.push(formatArray);
      }
      // Traverse nested fields (containers have fields array)
      if (formatArray.fields) {
        this.findCalldataFields(formatArray.fields, results);
      }
      return results;
    }

    if (!Array.isArray(formatArray)) return results;

    for (const item of formatArray) {
      if (item.type === 'calldata' && item.path) {
        results.push(item);
      }
      // Recursively traverse containers and their nested fields
      if (item.fields) {
        this.findCalldataFields(item.fields, results);
      }
    }
    return results;
  }

  /**
   * Find multicallDecoder field definitions
   * Recursively traverses containers and nested field arrays
   * @param {Array|object} formatArray - Format array or object from metadata
   * @param {Array} results - Accumulated results
   * @returns {Array}
   */
  findMulticallDecoderFields(formatArray, results = []) {
    // Handle single object
    if (formatArray && typeof formatArray === 'object' && !Array.isArray(formatArray)) {
      if (formatArray.type === 'multicallDecoder' && formatArray.path) {
        results.push(formatArray);
      }
      if (formatArray.fields) {
        this.findMulticallDecoderFields(formatArray.fields, results);
      }
      return results;
    }

    if (!Array.isArray(formatArray)) return results;

    for (const item of formatArray) {
      if (item.type === 'multicallDecoder' && item.path) {
        results.push(item);
      }
      if (item.fields) {
        this.findMulticallDecoderFields(item.fields, results);
      }
    }
    return results;
  }

  /**
   * Handle multicallDecoder field type - parse packed transactions
   * Uses metadata-driven structure from parsing.multicallStructure
   * @param {object} fieldDef - Field definition from metadata
   * @param {string} rawValue - Raw bytes data
   * @param {object} context - Decoding context
   * @param {number} chainId - Chain ID
   * @param {number} depth - Current depth
   * @returns {Promise<object>}
   */
  async handleMulticallDecoder(fieldDef, rawValue, context, chainId, depth, multicallStructure = null) {
    // Use passed structure - no fallback, must come from metadata
    const structure = multicallStructure;
    if (!structure) {
      console.warn('[RecursiveDecoder] No multicall structure in metadata');
      return { error: 'No multicall structure in metadata', operations: [] };
    }
    console.log('[RecursiveDecoder] Using multicall structure:', Object.keys(structure));

    // Parse the packed transactions using structure from metadata
    const operations = this.parsePackedTransactions(rawValue, structure);
    console.log(`[handleMulticallDecoder] Parsed ${operations.length} operations at depth ${depth}`);

    const decodedOperations = [];
    const intents = [];
    const seenIntentKeys = new Set(); // Dedupe by intent content

    // Limit operations based on format config
    const maxOps = fieldDef.format?.maxTransactions || 20;
    const opsToProcess = operations.slice(0, maxOps);

    for (let i = 0; i < opsToProcess.length; i++) {
      const op = opsToProcess[i];

      let decodedOp = {
        index: i,
        operation: op.operation,
        operationType: this.getOperationType(op.operation),
        to: op.to,
        value: op.value,
        data: op.data,
        selector: op.data?.length >= 10 ? op.data.slice(0, 10) : null
      };

      // Recursively decode nested calldata if enabled
      if (fieldDef.format?.parseNestedCalls !== false && op.data && op.data.length > 10) {
        try {
          const nestedDecode = await this.decode(op.data, op.to, chainId, context, depth + 1);
          if (nestedDecode.success) {
            decodedOp.decoded = nestedDecode;
            // CRITICAL: Only collect LEAF intents to prevent duplication
            // If nestedDecode has nestedIntents, use those (already flattened)
            // Otherwise use the basic intent (not aggregatedIntent which contains duplicates)
            if (nestedDecode.nestedIntents?.length > 0) {
              console.log(`[handleMulticallDecoder] Op ${i} has nestedIntents:`, nestedDecode.nestedIntents);
              // Use the individual nested intents, not the aggregated string
              for (const leafIntent of nestedDecode.nestedIntents) {
                if (leafIntent && !seenIntentKeys.has(leafIntent)) {
                  seenIntentKeys.add(leafIntent);
                  intents.push(leafIntent);
                }
              }
            } else {
              // No nested intents, use the base intent only - enhance with amounts if available
              let leafIntent = nestedDecode.intent;

              // Enhance intent with formatted amounts from decoded params
              leafIntent = this.enhanceIntentWithAmount(leafIntent, nestedDecode.formatted, nestedDecode.params);

              console.log(`[handleMulticallDecoder] Op ${i} intent:`, leafIntent);
              if (leafIntent && !seenIntentKeys.has(leafIntent)) {
                seenIntentKeys.add(leafIntent);
                intents.push(leafIntent);
              }
            }
          }
        } catch (e) {
          // Silently continue on decode errors
        }
      }

      decodedOperations.push(decodedOp);
    }

    console.log(`[handleMulticallDecoder] Final intents (${intents.length}):`, intents);
    return {
      operations: decodedOperations,
      totalCount: operations.length,
      truncated: operations.length > maxOps,
      intents
    };
  }

  /**
   * Parse packed multicall transactions using metadata structure
   * NO HARDCODED BYTE OFFSETS - uses field sizes from metadata
   * @param {string} data - Raw hex data
   * @param {object} structure - Parsing structure from metadata
   * @returns {Array}
   */
  parsePackedTransactions(data, structure) {
    const transactions = [];
    const cleanData = data.startsWith('0x') ? data.slice(2) : data;
    let pos = 0;
    const maxTransactions = 50;
    let txCount = 0;

    // Convert metadata structure format to fields array
    // Metadata format: { operation: {type, size}, to: {type, size}, ... }
    // Convert to: [{ name: 'operation', type, size }, ...]
    let fields;
    if (Array.isArray(structure.fields)) {
      fields = structure.fields;
    } else {
      // Convert object format to array
      fields = Object.entries(structure).map(([name, def]) => ({
        name,
        type: def.type,
        size: def.size,
        dynamic: def.dynamic
      }));
    }

    console.log('[parsePackedTransactions] Fields:', fields.map(f => f.name));

    while (pos < cleanData.length && txCount < maxTransactions) {
      const tx = {};
      let currentPos = pos;

      // Check minimum data remaining (only fixed-size fields)
      const fixedFieldsSize = fields
        .filter(f => !f.dynamic && f.size)
        .reduce((sum, f) => sum + f.size * 2, 0);

      if (currentPos + fixedFieldsSize > cleanData.length) break;

      // Parse each field according to structure from metadata
      for (const field of fields) {
        if (field.dynamic) {
          // Dynamic field - use dataLength from previous field
          const dataLength = tx.dataLength || 0;
          if (dataLength > 0) {
            tx[field.name] = '0x' + cleanData.slice(currentPos, currentPos + dataLength);
            currentPos += dataLength;
          } else {
            tx[field.name] = '0x';
          }
        } else {
          const hexSize = field.size * 2;
          const rawValue = cleanData.slice(currentPos, currentPos + hexSize);

          if (field.type === 'uint8' || field.type === 'int8') {
            tx[field.name] = parseInt(rawValue, 16);
          } else if (field.type === 'address') {
            tx[field.name] = '0x' + rawValue;
          } else if (field.type === 'uint256') {
            if (field.name === 'dataLength') {
              // dataLength is in bytes, convert to hex chars
              tx[field.name] = parseInt(rawValue, 16) * 2;
            } else {
              tx[field.name] = '0x' + rawValue;
            }
          } else {
            tx[field.name] = '0x' + rawValue;
          }
          currentPos += hexSize;
        }
      }

      transactions.push(tx);
      pos = currentPos;
      txCount++;
    }

    console.log(`[parsePackedTransactions] Parsed ${transactions.length} transactions`);
    return transactions;
  }

  /**
   * Get operation type info from metadata
   * @param {number} opCode - Operation code
   * @returns {object}
   */
  getOperationType(opCode) {
    // Operation types - common multicall convention
    // 0 = Call, 1 = DelegateCall (used by Safe, and others)
    if (opCode === 0) return { name: 'Call', color: '#48bb78' };
    if (opCode === 1) return { name: 'DelegateCall', color: '#ed8936' };
    return { name: `Operation ${opCode}`, color: '#a0aec0' };
  }

  /**
   * Enhance intent string with formatted amount if available
   * Uses formatted params to append amount to intent (e.g., "Approve USDC" → "Approve 0.80 USDC")
   * @param {string} intent - Original intent string
   * @param {object} formatted - Formatted parameter values from decode
   * @param {object} params - Raw parameter values
   * @returns {string} - Enhanced intent with amount
   */
  enhanceIntentWithAmount(intent, formatted, params) {
    if (!intent || !formatted) return intent;

    // Look for amount/value params with formatted values
    // Common param names for amounts: amount, value, assets, shares, wad
    const amountParamNames = ['amount', 'value', 'assets', 'shares', 'wad', 'amountIn', 'amountOut', 'amount0', 'amount1'];

    for (const paramName of amountParamNames) {
      const formattedParam = formatted[paramName];
      if (formattedParam && formattedParam.value) {
        const formattedValue = formattedParam.value;
        // Skip if already in intent or if it's just a raw hex/number
        if (intent.includes(formattedValue)) continue;
        if (formattedValue.startsWith('0x')) continue;
        // Check if it looks like a formatted amount (contains decimal or space for symbol)
        if (formattedValue.includes('.') || formattedValue.includes(' ')) {
          // Insert amount into intent - try to place it intelligently
          // If intent ends with token symbol, insert before it
          const symbolMatch = intent.match(/\s+(USDC|USDT|DAI|WETH|ETH|WBTC|[A-Z]{2,5})$/i);
          if (symbolMatch) {
            // Replace "Approve USDC" with "Approve 0.80 USDC"
            const symbol = symbolMatch[1];
            // Check if formatted value already includes the symbol
            if (formattedValue.includes(symbol)) {
              return intent.replace(new RegExp(`\\s+${symbol}$`, 'i'), ` ${formattedValue}`);
            }
          }
          // Otherwise append the formatted amount
          return `${intent} (${formattedValue})`;
        }
      }
    }

    return intent;
  }

  /**
   * Handle multicallSummary field type - generate statistics
   * @param {object} fieldDef - Field definition from metadata
   * @param {Array} operations - Parsed operations from multicallDecoder
   * @returns {object}
   */
  handleMulticallSummary(fieldDef, operations) {
    const format = fieldDef.format || {};
    const summary = {
      totalOperations: operations.length,
      totalValue: BigInt(0),
      contractInteractions: new Map(),
      tokenTransfers: [],
      categories: {}
    };

    for (const op of operations) {
      // Accumulate value
      if (op.value && op.value !== '0x0' && op.value !== '0x') {
        try {
          const cleanValue = op.value.startsWith('0x') ? op.value : '0x' + op.value;
          summary.totalValue += BigInt(cleanValue);
        } catch { /* ignore invalid values */ }
      }

      // Group by contract if enabled
      if (format.groupByContract) {
        const addr = op.to?.toLowerCase() || 'unknown';
        if (!summary.contractInteractions.has(addr)) {
          summary.contractInteractions.set(addr, []);
        }
        summary.contractInteractions.get(addr).push(op);
      }

      // Track token transfers if enabled - use metadata category instead of hardcoded patterns
      if (format.showTokenTransfers && op.decoded) {
        // Use category from metadata instead of function name pattern matching
        const category = op.decoded.category?.toLowerCase() || '';
        if (category === 'transfer' || category === 'approval' || category === 'token') {
          summary.tokenTransfers.push({
            contract: op.to,
            function: op.decoded.functionName,
            intent: op.decoded.intent
          });
        }
      }

      // Categorize operations
      const category = op.decoded?.category || 'unknown';
      summary.categories[category] = (summary.categories[category] || 0) + 1;
    }

    // Convert BigInt to string for serialization
    summary.totalValueFormatted = this.formatEther(summary.totalValue);
    summary.contractInteractions = Object.fromEntries(summary.contractInteractions);

    return summary;
  }

  /**
   * Format wei to ETH string
   * @param {BigInt} wei - Value in wei
   * @returns {string}
   */
  formatEther(wei) {
    try {
      const eth = Number(wei) / 1e18;
      if (eth === 0) return '0 ETH';
      return eth > 0.0001 ? `${eth.toFixed(4)} ETH` : `${eth.toExponential(2)} ETH`;
    } catch {
      return '0 ETH';
    }
  }

  /**
   * Aggregate intents from nested decodes
   * @param {object} processedResult - Result from processFieldsRecursively
   * @returns {Array<string>}
   */
  aggregateIntents(processedResult) {
    const intents = [];
    const seenIntents = new Set(); // Prevent duplicates

    console.log(`[aggregateIntents] Processing ${processedResult.nestedDecodes?.length || 0} nested decodes`);

    for (const nested of processedResult.nestedDecodes || []) {
      console.log(`[aggregateIntents] Entry - type: ${nested.type}, fieldPath: ${nested.fieldPath}`);

      if (nested.type === 'multicall') {
        // multicall has intents array - these are already leaf intents
        console.log(`[aggregateIntents] multicall intents:`, nested.result.intents);
        for (const intent of nested.result.intents || []) {
          if (intent && !seenIntents.has(intent)) {
            seenIntents.add(intent);
            intents.push(intent);
          }
        }
      } else if (nested.result?.nestedIntents?.length > 0) {
        // Calldata decode with nested intents - use the flattened array
        console.log(`[aggregateIntents] Calldata nestedIntents:`, nested.result.nestedIntents);
        for (const intent of nested.result.nestedIntents) {
          if (intent && !seenIntents.has(intent)) {
            seenIntents.add(intent);
            intents.push(intent);
          }
        }
      } else if (nested.result?.intent) {
        // Leaf decode with single intent
        const intent = nested.result.intent;
        console.log(`[aggregateIntents] Leaf intent:`, intent);
        if (intent && !seenIntents.has(intent)) {
          seenIntents.add(intent);
          intents.push(intent);
        }
      }
    }

    console.log(`[aggregateIntents] Final aggregated intents (${intents.length}):`, intents);
    return intents;
  }

  /**
   * Get metadata for a contract
   * @param {string} address - Contract address
   * @param {number} chainId - Chain ID
   * @param {string} selector - Function selector for proxy detection
   * @returns {Promise<object|null>}
   */
  async getMetadata(address, chainId, selector = null) {
    if (window.metadataService) {
      return await window.metadataService.getContractMetadata(address, chainId, selector);
    }
    return null;
  }
}

// Create and export global instance
window.RecursiveCalldataDecoder = RecursiveCalldataDecoder;
window.recursiveCalldataDecoder = new RecursiveCalldataDecoder();

/**
 * Enhanced decode function that uses recursive decoder
 * Drop-in replacement for decodeCalldata with nested support
 */
window.decodeCalldataRecursive = async function(data, contractAddress, chainId) {
  if (window.recursiveCalldataDecoder) {
    return await window.recursiveCalldataDecoder.decode(data, contractAddress, chainId);
  }
  // Fallback to non-recursive decode
  return await window.decodeCalldata(data, contractAddress, chainId);
};

// Recursive calldata decoder ready
