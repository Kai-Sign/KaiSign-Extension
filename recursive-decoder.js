/**
 * recursive-decoder.js - Nested Calldata Decoder (RecursiveCalldataDecoder)
 *
 * Purpose
 *   Decodes calldata that contains other calldata (e.g. multicall, exec
 *   wrappers, router pipelines). Drives recursion entirely from ERC-7730
 *   metadata's display.recursive directives - no protocol logic in code.
 *   Loaded into the page's MAIN world.
 *
 * Trust boundary
 *   Inner calldata blobs are untrusted. A malformed nested call must not
 *   crash the outer decode; it should report a per-step error and surface
 *   what was decoded successfully. Metadata is also untrusted - a
 *   metadata-driven recursion that loops forever or recurses too deep must
 *   be bounded.
 *
 * Security-critical invariants
 *   - Bounded recursion. maxDepth defaults to 5 (line 32) and is enforced
 *     before each recursive descent (line 61). Removing this enables an
 *     unbounded recursion DoS via crafted metadata or crafted calldata.
 *   - Cycle detection. decodingStack (line 33) tracks the current descent;
 *     a cycle yields an error rather than infinite work.
 *   - Zero hardcoded selectors / protocol logic. Every parsing structure
 *     comes from metadata. Adding a "just for protocol X" branch here
 *     defeats the audit invariant that this decoder treats all metadata
 *     uniformly.
 *
 * Trust dependencies
 *   - decode.js (window.SimpleInterface) - inner ABI decoding is delegated
 *     to the same bounded primitives that decode the outer call.
 *   - ERC-7730 metadata's display.recursive shape - treated as configuration,
 *     bounded by maxDepth.
 *
 * Out of scope
 *   - Top-level intent rendering (decode.js).
 *   - On-chain verification (onchain-verifier.js).
 */

// Guard against duplicate loading (MAIN world scripts can run multiple times)
if (window.recursiveCalldataDecoder) {
  console.log('[KaiSign] Recursive decoder already loaded, skipping');
} else {

function getKaiSignDebugFlag() {
  try {
    return typeof window !== 'undefined' && window.localStorage?.getItem('kaisign_dev_mode') === 'true';
  } catch {
    return false;
  }
}

const KAISIGN_DEBUG = getKaiSignDebugFlag();

function isGenericWrapperIntent(intent) {
  if (!intent || typeof intent !== 'string') return true;
  if (intent === 'Contract interaction' || intent === 'Unknown function') return true;
  if (intent.startsWith('Unknown call ') || intent.startsWith('Function call: ')) return true;
  return /^Execute(?:\s+call|\s+batch(?:\s+transactions?)?|\s+transactions?)?\s*$/i.test(intent)
    || /^Aggregate calls?$/i.test(intent)
    || /^Multicall\b/i.test(intent)
    || /^Batch\b/i.test(intent);
}

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
    KAISIGN_DEBUG && console.log(`[RecursiveDecoder] decode ENTER: depth=${depth}, target=${targetAddress}, selector=${calldata.slice(0,10)}...`);
    
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
      KAISIGN_DEBUG && console.log(`[RecursiveDecoder] Cycle detected: ${stackKey}`);
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
      KAISIGN_DEBUG && console.log(`[RecursiveDecoder] Initial decode result: success=${decoded.success}, function=${decoded.functionName || decoded.function}, intent="${decoded.intent}"`);

      if (!decoded.success) {
        return { ...decoded, depth };
      }

      // Reuse metadata returned by the top-level decode when available.
      // Refetching here duplicates the slowest path and creates a second
      // failure point for simple calls that do not need recursion at all.
      let metadata = decoded.metadata || null;
      if (!metadata) {
        KAISIGN_DEBUG && console.log(`[RecursiveDecoder] Requesting metadata: address=${targetAddress}, chainId=${chainId}, selector=${selector}`);
        metadata = await this.getMetadata(targetAddress, chainId, selector);
      } else {
        KAISIGN_DEBUG && console.log('[RecursiveDecoder] Reusing metadata from initial decode');
      }
      KAISIGN_DEBUG && console.log(`[RecursiveDecoder] Metadata retrieved: ${metadata ? 'YES' : 'NO'}`);

      // Process fields looking for nested calldata
      // Use function signature (e.g. "multicall(bytes)") if available, fallback to functionName
      const paramsForRecursion = decoded.rawParams || decoded.params;
      const processedResult = await this.processFieldsRecursively(
        paramsForRecursion,
        decoded.function || decoded.functionName,
        metadata,
        { params: decoded.params, parentContext, targetAddress },
        chainId,
        depth
      );

      // Aggregate intents from nested decodes
      const nestedIntents = this.aggregateIntents(processedResult);

      const wrapperIntent = decoded.wrapperIntent || decoded.intent;
      let aggregatedIntent;
      if (nestedIntents.length > 0) {
        const joined = nestedIntents.join(' + ');
        if (isGenericWrapperIntent(wrapperIntent) || nestedIntents.length === 1) {
          aggregatedIntent = joined;
        } else {
          aggregatedIntent = `${wrapperIntent}: ${joined}`;
        }
      }

      return {
        ...decoded,
        params: decoded.params,
        nestedDecodes: processedResult.nestedDecodes,
        nestedIntents,
        aggregatedIntent,
        wrapperIntent,
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
    KAISIGN_DEBUG && console.log(`[RecursiveDecoder] processFieldsRecursively ENTER: function="${functionName}", depth=${depth}, hasMetadata=${!!metadata}`);
    KAISIGN_DEBUG && console.log(`[RecursiveDecoder] Available params: ${Object.keys(params).join(', ')}`);
    
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
      KAISIGN_DEBUG && console.log('[RecursiveDecoder] No format found for:', functionName.split('(')[0], 'available:', displayFormatKeys.join(', '));
    }

    if (!format) {
      KAISIGN_DEBUG && console.log(`[RecursiveDecoder] No format found for function "${functionName}", skipping field processing`);
      return { params: processedParams, nestedDecodes };
    }

    KAISIGN_DEBUG && console.log(`[RecursiveDecoder] Found format for function "${functionName}" (matchedKey: ${matchedKey})`);

    // Find all calldata field definitions and DEDUPLICATE by path
    const calldataFieldsMap = new Map(); // Use Map to dedupe by path

    if (format.intent?.format) {
      KAISIGN_DEBUG && console.log(`[RecursiveDecoder] Checking intent.format for calldata fields`);
      const intentFields = [];
      this.findCalldataFields(format.intent.format, intentFields);
      for (const field of intentFields) {
        if (field.path && !calldataFieldsMap.has(field.path)) {
          calldataFieldsMap.set(field.path, field);
          KAISIGN_DEBUG && console.log(`[RecursiveDecoder] Found calldata field in intent.format: path="${field.path}", type="${field.type}", format="${field.format}"`);
        }
      }
    }

    if (format.fields) {
      KAISIGN_DEBUG && console.log(`[RecursiveDecoder] Checking format.fields (${format.fields.length} fields)`);
      for (const field of format.fields) {
        if ((field.type === 'calldata' || field.format === 'calldata') && field.path) {
          // Only add if not already present
          if (!calldataFieldsMap.has(field.path)) {
            calldataFieldsMap.set(field.path, field);
            KAISIGN_DEBUG && console.log(`[RecursiveDecoder] Found calldata field in format.fields: path="${field.path}", type="${field.type}", format="${field.format}"`);
          }
        }
      }
    }
    
    KAISIGN_DEBUG && console.log(`[RecursiveDecoder] Total unique calldata fields: ${calldataFieldsMap.size}`);

    // Process UNIQUE calldata fields only
    const processedPaths = new Set();
    KAISIGN_DEBUG && console.log(`[RecursiveDecoder] Processing ${calldataFieldsMap.size} unique calldata fields`);
    
    for (const [path, fieldDef] of calldataFieldsMap) {
      if (processedPaths.has(path)) continue;
      processedPaths.add(path);

      KAISIGN_DEBUG && console.log(`[RecursiveDecoder] Processing calldata field: path="${path}", fieldDef=`, fieldDef);
      
      let pathStr = fieldDef.path;

      // Strip #. or @. prefix if present (ERC-7730 format)
      if (pathStr.startsWith('#.') || pathStr.startsWith('@.')) {
        pathStr = pathStr.substring(2);
      }

      // Handle array paths like "calls.[].data" or "_swapData.[].callData" with parallel calleePath
      if (pathStr.includes('[]')) {
        KAISIGN_DEBUG && console.log('[RecursiveDecoder] Processing array path:', pathStr);

        // Parse array path: "_swapData.[].callData" -> arrayFieldName="_swapData", dataFieldName="callData"
        const parts = pathStr.split('.');
        const arrayFieldName = parts[0]; // "_swapData"
        const dataFieldName = parts[parts.length - 1]; // "callData"

        // Get calleePath for target resolution (supports params.calleePath or field.to)
        let calleePathStr = fieldDef.params?.calleePath || fieldDef.to;
        // Strip #. or @. prefix from calleePath too
        if (calleePathStr?.startsWith('#.') || calleePathStr?.startsWith('@.')) {
          calleePathStr = calleePathStr.substring(2);
        }
        const calleeFieldName = calleePathStr?.split('.').pop(); // "callTo"

        const arrayData = params[arrayFieldName];
        if (Array.isArray(arrayData)) {
          KAISIGN_DEBUG && console.log(`[RecursiveDecoder] Found ${arrayData.length} items in ${arrayFieldName}`);

          for (let i = 0; i < arrayData.length; i++) {
            const item = arrayData[i];
            const calldata = item[dataFieldName];
            const target = item[calleeFieldName];

            KAISIGN_DEBUG && console.log(`[RecursiveDecoder] Decoding ${arrayFieldName}[${i}].${dataFieldName} → target: ${target?.slice(0, 12)}...`);

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
      KAISIGN_DEBUG && console.log(`[RecursiveDecoder] Target address spec: "${targetAddress}"`);
      
      if (targetAddress) {
        if (targetAddress.startsWith('$.') || targetAddress.startsWith('#.')) {
          // JSONPath format: "$.to", "#._swapData.[].callTo", etc.
          // resolveFieldPath handles both #. and $. prefixes and array notation
          KAISIGN_DEBUG && console.log(`[RecursiveDecoder] Resolving JSONPath: "${targetAddress}"`);
          targetAddress = window.resolveFieldPath ? window.resolveFieldPath(targetAddress, params) : window.resolveJsonPath(targetAddress, params);
          KAISIGN_DEBUG && console.log(`[RecursiveDecoder] JSONPath resolved to: "${targetAddress}"`);
        } else if (!targetAddress.startsWith('0x')) {
          // Simple field name: "to" -> resolve from params.to
          KAISIGN_DEBUG && console.log(`[RecursiveDecoder] Resolving simple field: "${targetAddress}"`);
          targetAddress = params[targetAddress];
          KAISIGN_DEBUG && console.log(`[RecursiveDecoder] Field resolved to: "${targetAddress}"`);
        }
        // else: already an address like "0x..."
      }

      if (!targetAddress) {
        KAISIGN_DEBUG && console.log(`[RecursiveDecoder] No target address resolved, skipping field "${path}"`);
        continue;
      }

      KAISIGN_DEBUG && console.log(`[RecursiveDecoder] Recursively decoding: rawValue length=${rawValue.length}, target=${targetAddress}, depth=${depth+1}`);
      
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
      if (field.format === 'multicallBatch' || field.path === 'transactions') {
        const paramName = field.path;

        // Skip if already processed
        if (processedMulticallPaths.has(paramName)) continue;

        const rawValue = params[paramName];
        if (!rawValue || rawValue === '0x' || rawValue.length < 4) continue;

        // If transactions is ABI-encoded bytes, decode to raw packed hex first.
        // If it's already raw bytes, leave it as-is.
        let packedValue = rawValue;
        if (typeof packedValue === 'string' && packedValue.startsWith('0x') && packedValue.length >= 66) {
          try {
            const hex = packedValue.slice(2);
            const lenHex = hex.slice(0, 64);
            const len = parseInt(lenHex, 16);
            const remaining = hex.length - 64;
            const paddedOk = remaining % 64 === 0;
            const lengthFits = len > 0 && len * 2 <= remaining;
            if (lengthFits && paddedOk) {
              const dataStart = 64;
              const dataEnd = dataStart + len * 2;
              packedValue = '0x' + hex.slice(dataStart, dataEnd);
            }
          } catch {}
        }

        processedMulticallPaths.add(paramName);

        // Use multicall structure from metadata
        const multicallResult = await this.handleMulticallDecoder(
          { path: paramName, format: { parseNestedCalls: true } },
          packedValue,
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
      KAISIGN_DEBUG && console.log('[RecursiveDecoder] No multicall structure in metadata');
      return { error: 'No multicall structure in metadata', operations: [] };
    }
    KAISIGN_DEBUG && console.log('[RecursiveDecoder] Using multicall structure:', Object.keys(structure));

    // Parse the packed transactions using structure from metadata
    const operations = this.parsePackedTransactions(rawValue, structure);
    KAISIGN_DEBUG && console.log(`[handleMulticallDecoder] Parsed ${operations.length} operations at depth ${depth}`);

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
              KAISIGN_DEBUG && console.log(`[handleMulticallDecoder] Op ${i} has nestedIntents:`, nestedDecode.nestedIntents);
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

              KAISIGN_DEBUG && console.log(`[handleMulticallDecoder] Op ${i} intent:`, leafIntent);
              if (leafIntent && !seenIntentKeys.has(leafIntent)) {
                seenIntentKeys.add(leafIntent);
                intents.push(leafIntent);
              }
            }
          } else {
            // Decode failed (no metadata) - show fallback with operation type, selector and target
            const selector = op.data?.slice(0, 10) || '0x';
            const shortAddr = op.to ? `${op.to.slice(0, 8)}...${op.to.slice(-6)}` : 'Unknown';
            const opType = op.operation || 'Call';
            const fallbackIntent = `${opType} ${selector} to ${shortAddr}`;
            KAISIGN_DEBUG && console.log(`[handleMulticallDecoder] Op ${i} fallback (no metadata):`, fallbackIntent);
            if (!seenIntentKeys.has(fallbackIntent)) {
              seenIntentKeys.add(fallbackIntent);
              intents.push(fallbackIntent);
            }
          }
        } catch (e) {
          // Decode error - show fallback
          const selector = op.data?.slice(0, 10) || '0x';
          const shortAddr = op.to ? `${op.to.slice(0, 8)}...${op.to.slice(-6)}` : 'Unknown';
          const opType = op.operation || 'Call';
          const fallbackIntent = `${opType} ${selector} to ${shortAddr}`;
          KAISIGN_DEBUG && console.log(`[handleMulticallDecoder] Op ${i} error fallback:`, fallbackIntent, e.message);
          if (!seenIntentKeys.has(fallbackIntent)) {
            seenIntentKeys.add(fallbackIntent);
            intents.push(fallbackIntent);
          }
        }
      }

      decodedOperations.push(decodedOp);
    }

    KAISIGN_DEBUG && console.log(`[handleMulticallDecoder] Final intents (${intents.length}):`, intents);
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
    const inputData = data.startsWith('0x') ? data.slice(2) : data;
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

    const cleanData = this.normalizePackedTransactionsInput(inputData, fields);

    KAISIGN_DEBUG && console.log('[parsePackedTransactions] Fields:', fields.map(f => f.name));

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

    KAISIGN_DEBUG && console.log(`[parsePackedTransactions] Parsed ${transactions.length} transactions`);
    return transactions;
  }

  normalizePackedTransactionsInput(data, fields) {
    const fixedFieldsSize = fields
      .filter(f => !f.dynamic && f.size)
      .reduce((sum, f) => sum + f.size * 2, 0);

    const fromHeadlessCalldata = this.unwrapHeadlessDynamicBytesArgument(data, fixedFieldsSize);
    const fromCalldata = this.unwrapSingleDynamicBytesCalldata(fromHeadlessCalldata, fixedFieldsSize);
    return this.unwrapAbiEncodedBytesPayload(fromCalldata, fixedFieldsSize);
  }

  unwrapHeadlessDynamicBytesArgument(data, fixedFieldsSize) {
    if (!data || data.length < 128 || data.length % 2 !== 0) {
      return data;
    }

    try {
      const declaredOffset = BigInt('0x' + data.slice(0, 64));
      const bytesStart = Number(declaredOffset * 2n);
      if (declaredOffset < 0n || bytesStart + 64 > data.length) {
        return data;
      }

      const declaredByteLength = BigInt('0x' + data.slice(bytesStart, bytesStart + 64));
      if (declaredByteLength <= 0n) {
        return data;
      }

      const availableByteLength = BigInt((data.length - (bytesStart + 64)) / 2);
      if (declaredByteLength > availableByteLength) {
        return data;
      }

      const payloadHexLength = Number(declaredByteLength * 2n);
      const payload = data.slice(bytesStart + 64, bytesStart + 64 + payloadHexLength);
      const trailingPadding = data.slice(bytesStart + 64 + payloadHexLength);

      if (payload.length < fixedFieldsSize || (trailingPadding && !/^0*$/.test(trailingPadding))) {
        return data;
      }

      KAISIGN_DEBUG && console.log('[parsePackedTransactions] Unwrapped headless dynamic bytes argument');
      return payload;
    } catch {
      return data;
    }
  }

  unwrapSingleDynamicBytesCalldata(data, fixedFieldsSize) {
    if (!data || data.length < 136 || data.length % 2 !== 0) {
      return data;
    }

    try {
      const declaredOffset = BigInt('0x' + data.slice(8, 72));
      const bytesStart = 8 + Number(declaredOffset * 2n);
      if (declaredOffset < 0n || bytesStart + 64 > data.length) {
        return data;
      }

      const declaredByteLength = BigInt('0x' + data.slice(bytesStart, bytesStart + 64));
      if (declaredByteLength <= 0n) {
        return data;
      }

      const availableByteLength = BigInt((data.length - (bytesStart + 64)) / 2);
      if (declaredByteLength > availableByteLength) {
        return data;
      }

      const payloadHexLength = Number(declaredByteLength * 2n);
      const payload = data.slice(bytesStart + 64, bytesStart + 64 + payloadHexLength);
      const trailingPadding = data.slice(bytesStart + 64 + payloadHexLength);

      if (payload.length < fixedFieldsSize || (trailingPadding && !/^0*$/.test(trailingPadding))) {
        return data;
      }

      KAISIGN_DEBUG && console.log('[parsePackedTransactions] Unwrapped dynamic bytes calldata payload');
      return payload;
    } catch {
      return data;
    }
  }

  unwrapAbiEncodedBytesPayload(data, fixedFieldsSize) {
    if (!data || data.length < 128 || data.length % 2 !== 0) {
      return data;
    }

    try {
      const declaredByteLength = BigInt('0x' + data.slice(0, 64));
      if (declaredByteLength <= 0n) {
        return data;
      }

      const availableByteLength = BigInt((data.length - 64) / 2);
      if (declaredByteLength > availableByteLength) {
        return data;
      }

      const payloadHexLength = Number(declaredByteLength * 2n);
      const paddedHexLength = Math.ceil(payloadHexLength / 64) * 64;
      const totalWrappedHexLength = 64 + paddedHexLength;
      if (totalWrappedHexLength > data.length) {
        return data;
      }

      const trailingPadding = data.slice(64 + payloadHexLength);
      if (trailingPadding && !/^0*$/.test(trailingPadding)) {
        return data;
      }

      const payload = data.slice(64, 64 + payloadHexLength);
      if (payload.length < fixedFieldsSize) {
        return data;
      }

      KAISIGN_DEBUG && console.log('[parsePackedTransactions] Unwrapped ABI-encoded bytes payload');
      return payload;
    } catch {
      return data;
    }
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

    KAISIGN_DEBUG && console.log(`[aggregateIntents] Processing ${processedResult.nestedDecodes?.length || 0} nested decodes`);

    for (const nested of processedResult.nestedDecodes || []) {
      KAISIGN_DEBUG && console.log(`[aggregateIntents] Entry - type: ${nested.type}, fieldPath: ${nested.fieldPath}`);

      if (nested.type === 'multicall') {
        // multicall has intents array - these are already leaf intents
        KAISIGN_DEBUG && console.log(`[aggregateIntents] multicall intents:`, nested.result.intents);
        for (const intent of nested.result.intents || []) {
          if (intent && !seenIntents.has(intent)) {
            seenIntents.add(intent);
            intents.push(intent);
          }
        }
      } else if (nested.result?.nestedIntents?.length > 0) {
        // Calldata decode with nested intents - use the flattened array
        KAISIGN_DEBUG && console.log(`[aggregateIntents] Calldata nestedIntents:`, nested.result.nestedIntents);
        for (const intent of nested.result.nestedIntents) {
          if (intent && !seenIntents.has(intent)) {
            seenIntents.add(intent);
            intents.push(intent);
          }
        }
      } else if (nested.result?.intent) {
        // Leaf decode with single intent
        const intent = nested.result.intent;
        KAISIGN_DEBUG && console.log(`[aggregateIntents] Leaf intent:`, intent);
        if (intent && !seenIntents.has(intent)) {
          seenIntents.add(intent);
          intents.push(intent);
        }
      }
    }

    KAISIGN_DEBUG && console.log(`[aggregateIntents] Final aggregated intents (${intents.length}):`, intents);
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
    KAISIGN_DEBUG && console.log(`[RecursiveDecoder] getMetadata called: address=${address}, chainId=${chainId}, selector=${selector || '(none)'}`);
    if (window.metadataService) {
      const result = await window.metadataService.getContractMetadata(address, chainId, selector);
      KAISIGN_DEBUG && console.log(`[RecursiveDecoder] getMetadata result: ${result ? 'FOUND' : 'NOT FOUND'}`);
      return result;
    }
    KAISIGN_DEBUG && console.log(`[RecursiveDecoder] getMetadata: No metadataService available`);
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

} // End of duplicate-load guard
