// Recursive Calldata Decoder - ERC-7730 compliant, metadata-driven
// NO HARDCODED SELECTORS OR PROTOCOL-SPECIFIC LOGIC
// All parsing structures come from metadata

/**
 * RecursiveCalldataDecoder - Decodes nested calldata using ERC-7730 metadata
 *
 * Handles:
 * - "type": "calldata" fields with JSONPath target resolution
 * - "type": "multiSendDecoder" for packed batch transactions
 * - "type": "multiSendSummary" for aggregated statistics
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

    // Cycle detection
    const stackKey = `${targetAddress?.toLowerCase()}:${selector}:${depth}`;
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
      const processedResult = await this.processFieldsRecursively(
        decoded.params,
        decoded.functionName,
        metadata,
        { params: decoded.params, parentContext, targetAddress },
        chainId,
        depth
      );

      // Aggregate intents from nested decodes
      const nestedIntents = this.aggregateIntents(processedResult);
      const aggregatedIntent = nestedIntents.length > 0
        ? `${decoded.intent} → ${nestedIntents.join(' + ')}`
        : decoded.intent;

      return {
        ...decoded,
        params: processedResult.params,
        nestedDecodes: processedResult.nestedDecodes,
        nestedIntents,
        aggregatedIntent,
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
    const format = metadata?.display?.formats?.[functionName];

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

      const paramName = fieldDef.path;
      const rawValue = params[paramName];

      if (!rawValue || rawValue === '0x' || rawValue.length < 10) {
        continue;
      }

      // Resolve target address using JSONPath
      let targetAddress = fieldDef.to;
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

    // Track which paths have been processed as multiSend to avoid duplicates
    const processedMultiSendPaths = new Set();

    // Check for multiSendDecoder fields (explicit type in metadata)
    const multiSendFields = this.findMultiSendDecoderFields(format.intent?.format || []);
    for (const fieldDef of multiSendFields) {
      const paramName = fieldDef.path;
      if (!paramName || processedMultiSendPaths.has(paramName)) continue;

      const rawValue = params[paramName];
      if (!rawValue || rawValue === '0x') continue;

      processedMultiSendPaths.add(paramName);

      const multiSendResult = await this.handleMultiSendDecoder(
        fieldDef,
        rawValue,
        context,
        chainId,
        depth
      );

      if (multiSendResult.operations?.length > 0) {
        processedParams[`${paramName}_multiSend`] = multiSendResult;
        nestedDecodes.push({
          fieldPath: paramName,
          type: 'multiSend',
          result: multiSendResult
        });
      }
    }

    // Auto-detect multiSend structure from metadata's parsing section
    // This handles cases where format uses "multiSendBatch" without explicit type
    if (metadata?.parsing?.multiSendStructure && format?.fields) {
      for (const field of format.fields) {
        // Look for multiSendBatch format or transactions field
        if (field.format === 'multiSendBatch' || (field.path === 'transactions' && params.transactions)) {
          const paramName = field.path;
          // Skip if already processed
          if (processedMultiSendPaths.has(paramName)) continue;

          const rawValue = params[paramName];

          if (rawValue && rawValue !== '0x' && rawValue.length > 2) {
            processedMultiSendPaths.add(paramName);

            // Create a synthetic field def for handleMultiSendDecoder
            const multiSendResult = await this.handleMultiSendDecoder(
              { path: paramName, format: { parseNestedCalls: true } },
              rawValue,
              context,
              chainId,
              depth
            );

            if (multiSendResult.operations?.length > 0) {
              processedParams[`${paramName}_multiSend`] = multiSendResult;
              nestedDecodes.push({
                fieldPath: paramName,
                type: 'multiSend',
                result: multiSendResult
              });
            }
          }
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
   * Find multiSendDecoder field definitions
   * Recursively traverses containers and nested field arrays
   * @param {Array|object} formatArray - Format array or object from metadata
   * @param {Array} results - Accumulated results
   * @returns {Array}
   */
  findMultiSendDecoderFields(formatArray, results = []) {
    // Handle single object
    if (formatArray && typeof formatArray === 'object' && !Array.isArray(formatArray)) {
      if (formatArray.type === 'multiSendDecoder' && formatArray.path) {
        results.push(formatArray);
      }
      if (formatArray.fields) {
        this.findMultiSendDecoderFields(formatArray.fields, results);
      }
      return results;
    }

    if (!Array.isArray(formatArray)) return results;

    for (const item of formatArray) {
      if (item.type === 'multiSendDecoder' && item.path) {
        results.push(item);
      }
      if (item.fields) {
        this.findMultiSendDecoderFields(item.fields, results);
      }
    }
    return results;
  }

  /**
   * Handle multiSendDecoder field type - parse packed transactions
   * Uses metadata-driven structure from parsing.multiSendStructure
   * @param {object} fieldDef - Field definition from metadata
   * @param {string} rawValue - Raw bytes data
   * @param {object} context - Decoding context
   * @param {number} chainId - Chain ID
   * @param {number} depth - Current depth
   * @returns {Promise<object>}
   */
  async handleMultiSendDecoder(fieldDef, rawValue, context, chainId, depth) {
    // Get multiSend parsing structure from metadata (globally exposed)
    const structure = this.getMultiSendStructure();
    if (!structure) {
      console.warn('[RecursiveDecoder] No multiSend structure in metadata');
      return { error: 'No multiSend structure in metadata', operations: [] };
    }

    // Parse the packed transactions using structure from metadata
    const operations = this.parsePackedTransactions(rawValue, structure);

    const decodedOperations = [];
    const intents = [];

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
            intents.push(nestedDecode.aggregatedIntent || nestedDecode.intent);
          }
        } catch (e) {
          console.warn(`[RecursiveDecoder] Failed to decode operation ${i}:`, e.message);
        }
      }

      decodedOperations.push(decodedOp);
    }

    return {
      operations: decodedOperations,
      totalCount: operations.length,
      truncated: operations.length > maxOps,
      intents
    };
  }

  /**
   * Get multiSend structure from embedded or loaded metadata
   * @returns {object|null}
   */
  getMultiSendStructure() {
    // Check globally exposed batch transaction metadata (from metadata.js)
    const embedded = window.batchTransactionMetadata || window.multisendMetadata;
    if (embedded?.parsing?.multiSendStructure) {
      return embedded.parsing.multiSendStructure;
    }
    return null;
  }

  /**
   * Parse packed multiSend transactions using metadata structure
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

    while (pos < cleanData.length && txCount < maxTransactions) {
      const tx = {};
      let currentPos = pos;

      // Check minimum data remaining
      const fixedFieldsSize = structure.fields
        .filter(f => !f.sizeField)
        .reduce((sum, f) => sum + f.size * 2, 0);

      if (currentPos + fixedFieldsSize > cleanData.length) break;

      // Parse each field according to structure from metadata
      for (const field of structure.fields) {
        if (field.sizeField) {
          const dataLength = tx[field.sizeField] || 0;
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

    return transactions;
  }

  /**
   * Get operation type info from metadata
   * @param {number} opCode - Operation code
   * @returns {object}
   */
  getOperationType(opCode) {
    const metadata = window.batchTransactionMetadata || window.multisendMetadata;
    const opTypes = metadata?.parsing?.operationTypes;

    if (opTypes && opTypes[opCode]) {
      return opTypes[opCode];
    }

    return { name: `Operation ${opCode}`, color: '#a0aec0' };
  }

  /**
   * Handle multiSendSummary field type - generate statistics
   * @param {object} fieldDef - Field definition from metadata
   * @param {Array} operations - Parsed operations from multiSendDecoder
   * @returns {object}
   */
  handleMultiSendSummary(fieldDef, operations) {
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

      // Track token transfers if enabled
      if (format.showTokenTransfers && op.decoded?.functionName) {
        const fnName = op.decoded.functionName.toLowerCase();
        if (fnName.includes('transfer') || fnName.includes('approve')) {
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

    for (const nested of processedResult.nestedDecodes || []) {
      if (nested.type === 'multiSend') {
        // Aggregate multiSend intents
        intents.push(...(nested.result.intents || []));
      } else if (nested.result?.intent) {
        intents.push(nested.result.aggregatedIntent || nested.result.intent);
      }

      // Recurse into deeper nested decodes
      if (nested.result?.nestedDecodes) {
        const deeperIntents = this.aggregateIntents({ nestedDecodes: nested.result.nestedDecodes });
        intents.push(...deeperIntents);
      }
    }

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
