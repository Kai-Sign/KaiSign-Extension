// Pure dynamic decoder - NO HARDCODED METADATA
// KaiSign dynamic decoder v2.1 - FIXED formatTokenAmount
console.log('[decode.js] VERSION 2.1 LOADED - formatTokenAmount FIXED');

// Simple keccak256 implementation for selector calculation
// Uses SubtleCrypto when available, falls back to simple hash
function keccak256Simple(message) {
  // Try to use ethers if available
  if (typeof window !== 'undefined') {
    if (window.ethers?.keccak256 && window.ethers?.toUtf8Bytes) {
      try { return window.ethers.keccak256(window.ethers.toUtf8Bytes(message)); } catch {}
    }
    if (window.ethers?.utils?.keccak256 && window.ethers?.utils?.toUtf8Bytes) {
      try { return window.ethers.utils.keccak256(window.ethers.utils.toUtf8Bytes(message)); } catch {}
    }
  }

  // Minimal keccak256 implementation
  const KECCAK_ROUNDS = 24;
  const KECCAK_RC = [
    0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
    0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
    0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
    0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
    0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
    0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n
  ];
  const KECCAK_ROTC = [1,3,6,10,15,21,28,36,45,55,2,14,27,41,56,8,25,43,62,18,39,61,20,44];
  const KECCAK_PILN = [10,7,11,17,18,3,5,16,8,21,24,4,15,23,19,13,12,2,20,14,22,9,6,1];

  function rotl64(x, y) { return ((x << BigInt(y)) | (x >> BigInt(64 - y))) & 0xffffffffffffffffn; }

  function keccakF(state) {
    for (let round = 0; round < KECCAK_ROUNDS; round++) {
      const c = new Array(5).fill(0n);
      for (let x = 0; x < 5; x++) c[x] = state[x] ^ state[x+5] ^ state[x+10] ^ state[x+15] ^ state[x+20];
      for (let x = 0; x < 5; x++) {
        const t = c[(x+4)%5] ^ rotl64(c[(x+1)%5], 1);
        for (let y = 0; y < 25; y += 5) state[x+y] ^= t;
      }
      let t = state[1];
      for (let i = 0; i < 24; i++) {
        const j = KECCAK_PILN[i];
        const tmp = state[j];
        state[j] = rotl64(t, KECCAK_ROTC[i]);
        t = tmp;
      }
      for (let y = 0; y < 25; y += 5) {
        const t0 = state[y], t1 = state[y+1], t2 = state[y+2], t3 = state[y+3], t4 = state[y+4];
        state[y] = t0 ^ (~t1 & t2); state[y+1] = t1 ^ (~t2 & t3);
        state[y+2] = t2 ^ (~t3 & t4); state[y+3] = t3 ^ (~t4 & t0); state[y+4] = t4 ^ (~t0 & t1);
      }
      state[0] ^= KECCAK_RC[round];
    }
  }

  const encoder = new TextEncoder();
  const input = encoder.encode(message);
  const rate = 136, capacity = 64;
  const blockSize = rate;
  const state = new Array(25).fill(0n);

  const padded = new Uint8Array(Math.ceil((input.length + 1) / blockSize) * blockSize);
  padded.set(input);
  padded[input.length] = 0x01;
  padded[padded.length - 1] |= 0x80;

  for (let i = 0; i < padded.length; i += blockSize) {
    for (let j = 0; j < blockSize && j < 200; j += 8) {
      if (i + j + 8 <= padded.length) {
        let val = 0n;
        for (let k = 0; k < 8; k++) val |= BigInt(padded[i + j + k]) << BigInt(k * 8);
        state[Math.floor(j / 8)] ^= val;
      }
    }
    keccakF(state);
  }

  let hash = '0x';
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 8; j++) {
      hash += ((state[i] >> BigInt(j * 8)) & 0xffn).toString(16).padStart(2, '0');
    }
  }
  return hash;
}

// Calculate function selector from signature
function calculateSelector(signature) {
  const hash = keccak256Simple(signature);
  return hash.slice(0, 10);
}

// Enhanced ABI decoder - supports all Solidity types including bytes, bytes[], arrays
// NO HARDCODED SELECTORS - all type handling is generic
class SimpleInterface {
  constructor(abi) {
    this.abi = Array.isArray(abi) ? abi : [abi];
  }

  /**
   * Check if a type is dynamic (requires offset resolution)
   * @param {string} type - Solidity type
   * @param {object} input - ABI input definition (for checking tuple components)
   * @returns {boolean}
   */
  isDynamicType(type, input = null) {
    if (!type) return false;
    // bytes, string, and any array type are dynamic
    if (type === 'bytes' || type === 'string') return true;
    if (type.endsWith('[]')) return true;
    // Tuples with any dynamic components are dynamic (requires offset resolution)
    if (type === 'tuple' && input?.components) {
      return input.components.some(c => this.isDynamicType(c.type, c));
    }
    return false;
  }

  /**
   * Decode a static type from data
   * @param {string} type - Solidity type
   * @param {string} paramData - Hex data without 0x prefix
   * @param {number} offset - Offset in hex chars
   * @param {object} input - ABI input definition (for tuple components)
   * @returns {{value: any, size: number}}
   */
  decodeStaticType(type, paramData, offset, input = null) {
    // Address: 20 bytes right-padded in 32 bytes
    if (type === 'address') {
      const rawAddr = paramData.slice(offset + 24, offset + 64);
      return {
        value: '0x' + rawAddr.toLowerCase(),
        size: 64
      };
    }

    // Unsigned integers: uint8, uint16, ..., uint256
    if (type.startsWith('uint')) {
      const hexValue = paramData.slice(offset, offset + 64);
      try {
        const value = BigInt('0x' + hexValue);
        return {
          value: { _isBigNumber: true, _hex: '0x' + hexValue, _value: value.toString() },
          size: 64
        };
      } catch {
        return { value: '0x' + hexValue, size: 64 };
      }
    }

    // Signed integers: int8, int16, ..., int256
    if (type.startsWith('int')) {
      const hexValue = paramData.slice(offset, offset + 64);
      try {
        const value = BigInt('0x' + hexValue);
        return {
          value: { _isBigNumber: true, _hex: '0x' + hexValue, _value: value.toString() },
          size: 64
        };
      } catch {
        return { value: '0x' + hexValue, size: 64 };
      }
    }

    // Fixed-size bytes: bytes1, bytes2, ..., bytes32
    if (type.startsWith('bytes') && !type.endsWith('[]') && type !== 'bytes') {
      const byteSize = parseInt(type.replace('bytes', '')) || 32;
      const hexSize = byteSize * 2;
      const value = '0x' + paramData.slice(offset, offset + hexSize);
      return { value, size: 64 }; // Always takes 32 bytes in ABI encoding
    }

    // Boolean
    if (type === 'bool') {
      const lastByte = paramData.slice(offset + 62, offset + 64);
      return {
        value: lastByte !== '00',
        size: 64
      };
    }

    // Tuple (struct) - static tuples only
    if (type === 'tuple' && input?.components) {
      const tupleData = {};
      let tupleOffset = 0;

      for (const component of input.components) {
        if (this.isDynamicType(component.type, component)) {
          // Dynamic component in tuple - need to handle offset
          const dynOffset = parseInt(paramData.slice(offset + tupleOffset, offset + tupleOffset + 64), 16) * 2;
          const dynResult = this.decodeDynamicType(component.type, paramData, offset + dynOffset, component);
          tupleData[component.name] = dynResult;
          tupleOffset += 64;
        } else {
          const result = this.decodeStaticType(component.type, paramData, offset + tupleOffset, component);
          tupleData[component.name] = result.value;
          tupleOffset += result.size;
        }
      }

      return { value: tupleData, size: tupleOffset };
    }

    // Default: return raw hex
    return {
      value: '0x' + paramData.slice(offset, offset + 64),
      size: 64
    };
  }

  /**
   * Decode a dynamic type from data
   * @param {string} type - Solidity type
   * @param {string} paramData - Hex data without 0x prefix
   * @param {number} offset - Offset in hex chars (pointing to length field)
   * @param {object} input - ABI input definition
   * @returns {any}
   */
  decodeDynamicType(type, paramData, offset, input = null) {
    // Dynamic bytes
    if (type === 'bytes') {
      const length = parseInt(paramData.slice(offset, offset + 64), 16);
      const hexLength = length * 2;
      const data = paramData.slice(offset + 64, offset + 64 + hexLength);
      return '0x' + data;
    }

    // Dynamic string
    if (type === 'string') {
      const length = parseInt(paramData.slice(offset, offset + 64), 16);
      const hexLength = length * 2;
      const hexData = paramData.slice(offset + 64, offset + 64 + hexLength);
      return this.hexToString(hexData);
    }

    // Array types (address[], uint256[], bytes[], etc.)
    if (type.endsWith('[]')) {
      const baseType = type.slice(0, -2);
      const arrayLength = parseInt(paramData.slice(offset, offset + 64), 16);
      const results = [];

      if (this.isDynamicType(baseType, input)) {
        // Array of dynamic elements (e.g., bytes[], string[], tuple[] with dynamic components)
        // Each element has an offset pointer
        for (let i = 0; i < arrayLength; i++) {
          const elementOffsetHex = paramData.slice(offset + 64 + i * 64, offset + 64 + (i + 1) * 64);
          const elementOffset = parseInt(elementOffsetHex, 16) * 2;
          const value = this.decodeDynamicType(baseType, paramData, offset + 64 + elementOffset, input);
          results.push(value);
        }
      } else {
        // Array of static elements (e.g., address[], uint256[])
        let arrayOffset = offset + 64;
        for (let i = 0; i < arrayLength; i++) {
          const { value, size } = this.decodeStaticType(baseType, paramData, arrayOffset, input);
          results.push(value);
          arrayOffset += size;
        }
      }

      return results;
    }

    // Dynamic tuple (tuple with dynamic components)
    // The offset points to where the tuple data starts
    if (type === 'tuple' && input?.components) {
      const tupleData = {};
      let tupleOffset = 0;

      for (const component of input.components) {
        if (this.isDynamicType(component.type, component)) {
          // Dynamic component - read relative offset from tuple head, decode from tuple tail
          const relOffsetHex = paramData.slice(offset + tupleOffset, offset + tupleOffset + 64);
          const relOffset = parseInt(relOffsetHex, 16) * 2;
          const dynResult = this.decodeDynamicType(component.type, paramData, offset + relOffset, component);
          tupleData[component.name] = dynResult;
          tupleOffset += 64;
        } else {
          // Static component - read inline
          const result = this.decodeStaticType(component.type, paramData, offset + tupleOffset, component);
          tupleData[component.name] = result.value;
          tupleOffset += result.size;
        }
      }

      return tupleData;
    }

    // Fallback
    return '0x' + paramData.slice(offset, offset + 64);
  }

  /**
   * Convert hex string to UTF-8 string
   * @param {string} hex - Hex string without 0x prefix
   * @returns {string}
   */
  hexToString(hex) {
    let str = '';
    for (let i = 0; i < hex.length; i += 2) {
      const charCode = parseInt(hex.slice(i, i + 2), 16);
      if (charCode === 0) break; // Null terminator
      str += String.fromCharCode(charCode);
    }
    return str;
  }

  /**
   * Decode function calldata using ABI
   * @param {string} functionName - Function name to decode
   * @param {string} data - Full calldata including selector
   * @returns {Array} - Decoded parameters
   */
  decodeFunctionData(functionName, data) {
    const funcAbi = this.abi.find(item => item.name === functionName);
    if (!funcAbi) throw new Error(`Function ${functionName} not found`);

    // Remove function selector (first 4 bytes = 8 hex chars + 0x)
    const paramData = data.slice(10);
    const inputs = funcAbi.inputs || [];
    const results = [];

    // First pass: calculate head offsets and identify dynamic types
    let headOffset = 0;
    const dynamicParams = [];

    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];

      if (this.isDynamicType(input.type, input)) {
        // Dynamic type: read offset from head, decode from tail later
        const offsetHex = paramData.slice(headOffset, headOffset + 64);
        const tailOffset = parseInt(offsetHex, 16) * 2;
        dynamicParams.push({ index: i, input, tailOffset });
        headOffset += 64;
      } else {
        // Static type: decode directly from head
        const { value, size } = this.decodeStaticType(input.type, paramData, headOffset, input);
        results[i] = value;
        headOffset += size;
      }
    }

    // Second pass: decode dynamic types from their tail offsets
    for (const { index, input, tailOffset } of dynamicParams) {
      const value = this.decodeDynamicType(input.type, paramData, tailOffset, input);
      results[index] = value;
    }

    return results;
  }
}

// PURE dynamic decoding - only from metadata
async function decodeCalldata(data, contractAddress, chainId) {
  try {
    const selector = data.slice(0, 10);

    // Pass selector to metadata lookup for proxy detection (e.g., Safe proxies)
    let metadata = await getContractMetadata(contractAddress, chainId, selector);

    // If no metadata from subgraph, return failure
    if (!metadata) {
      return {
        success: false,
        selector,
        intent: 'Contract interaction',
        error: 'No metadata found in subgraph'
      };
    }
    
    // Find function in ABI from metadata
    let functionSignature = null;
    let functionName = null;
    let abiFunction = null;

    if (metadata.context?.contract?.abi && Array.isArray(metadata.context.contract.abi)) {
      for (const item of metadata.context.contract.abi) {
        if (item.type === 'function') {
          const types = (item.inputs || []).map(input => input.type).join(',');
          const signature = `${item.name}(${types})`;

          // Use stored selector or calculate it
          const expectedSelector = item.selector || calculateSelector(signature);
          console.log('[Decode] Checking function:', signature, 'selector:', expectedSelector, 'vs', selector);

          if (expectedSelector === selector) {
            functionSignature = signature;
            functionName = item.name;
            abiFunction = item;
            console.log('[Decode] ✅ MATCHED function:', signature);
            break;
          }
        }
      }
    } else if (typeof metadata.context?.contract?.abi === 'string' && metadata.context?.contract?.selectorFallbacks) {
      functionName = metadata.context.contract.selectorFallbacks[selector];
      if (functionName) functionSignature = `${functionName}(...)`;
    }
    
    if (!functionSignature && !functionName) {
      return {
        success: false,
        selector,
        intent: 'Unknown function',
        error: 'Function not found in metadata ABI'
      };
    }
    
    // Get intent from metadata
    let intent = 'Contract interaction';
    let fieldInfo = {};

    let format = metadata.display?.formats?.[functionSignature] || metadata.display?.formats?.[functionName];

    // Store command registries from metadata for later use
    const commandRegistries = metadata.commandRegistries || {};

    if (format) {
      // Handle ERC-7730 intent formats
      if (format.interpolatedIntent) {
        // ERC-7730 interpolatedIntent takes priority - will be processed after params are decoded
        intent = { type: 'interpolated', template: format.interpolatedIntent };
      } else if (format.intent?.type === 'composite') {
        // Composite intent - will be built from decoded commands later
        // Just mark it for now, actual building happens after decoding params
        intent = { type: 'composite', config: format.intent };
      } else if (format.intent?.template) {
        // Most common: intent.template string
        intent = format.intent.template;
      } else if (format.intent?.format && Array.isArray(format.intent.format)) {
        // Complex format with nested containers
        for (const item of format.intent.format) {
          if (item.type === 'container' && item.fields) {
            for (const field of item.fields) {
              if (field.type === 'text' && field.value && field.format === 'heading2') {
                intent = field.value;
                break;
              }
            }
            if (intent !== 'Contract interaction') break;
          }
        }
      } else if (typeof format.intent === 'string') {
        intent = format.intent;
      }

      // Extract field info from format.fields
      if (format.fields) {
        for (const field of format.fields) {
          if (field.path) {
            fieldInfo[field.path] = {
              label: field.label || field.path,
              format: field.format || 'raw',
              params: field.params || {},  // Store decimals, symbol, etc.
              // Store calldata target reference for recursive decoding
              type: field.type || (field.format === 'calldata' ? 'calldata' : 'raw'),
              calldataTarget: field.type === 'calldata' ? field.to : (field.format === 'calldata' ? (field.params?.calleePath || field.params?.to || null) : null)
            };
          }
        }
      }

      // Also extract calldata fields from ERC-7730 format.intent.format structure
      if (format.intent?.format && Array.isArray(format.intent.format)) {
        extractCalldataFieldsFromFormat(format.intent.format, fieldInfo);
      }
    }
    // Try messages format (KaiSign format)
    else if (metadata.messages?.[functionName]) {
      const messageFormat = metadata.messages[functionName];
      intent = messageFormat.label || intent;
      
      if (messageFormat.fields) {
        for (const field of messageFormat.fields) {
          if (field.path) {
            fieldInfo[field.path] = {
              label: field.label || field.path,
              format: field.type === 'address' ? 'address' : 
                     field.type === 'wei' ? 'wei' :
                     field.type === 'uint256' ? 'number' : 'raw'
            };
          }
        }
      }
    }
    
    // Format results based on metadata ONLY
    const params = {};
    const rawParams = {}; // Store original decoded values (not stringified)
    const formatted = {};

    if (abiFunction) {
      // Use ABI from metadata to decode
      const iface = new SimpleInterface([abiFunction]);
      const decodedData = iface.decodeFunctionData(functionName, data);

      // Generic formatting based on ABI inputs from metadata
      const inputs = abiFunction.inputs || [];
      for (let i = 0; i < decodedData.length && i < inputs.length; i++) {
        const input = inputs[i];
        const value = decodedData[i];
        const paramName = input.name || `param${i}`;

        // Store original decoded value for composite intent building
        rawParams[paramName] = value;

        // Get field info from metadata if available
        const fieldDef = fieldInfo[paramName];

        let rawValue;
        if (value && typeof value === 'object' && '_isBigNumber' in value) {
          rawValue = value._value || (value._hex ? BigInt(value._hex).toString() : String(value));
        } else if (typeof value === 'object' && value !== null) {
          rawValue = JSON.stringify(value);
        } else {
          rawValue = String(value || '');
        }

        // Apply formatting based on field definition
        let displayValue = rawValue;
        if (fieldDef?.format === 'amount' && fieldDef.params?.decimals) {
          // Check for max uint256 (unlimited approval)
          const MAX_UINT256 = '115792089237316195423570985008687907853269984665640564039457584007913129639935';
          if (rawValue === MAX_UINT256) {
            const symbol = fieldDef.params.symbol || '';
            displayValue = symbol ? `Unlimited ${symbol}` : 'Unlimited';
            console.log(`[Decode] Detected max uint256, displaying as: "${displayValue}"`);
          } else {
            // Format with decimals
            const decimals = fieldDef.params.decimals;
            const symbol = fieldDef.params.symbol || '';
            console.log(`[Decode] Formatting ${paramName}: rawValue="${rawValue}" (type: ${typeof rawValue}), decimals=${decimals} (type: ${typeof decimals}), symbol=${symbol}`);
            try {
              const dec = Number(decimals);
              const value = BigInt(rawValue);
              const divisor = BigInt(10) ** BigInt(dec);
              const integerPart = value / divisor;
              const fractionalPart = value % divisor;
              if (value === 0n) {
                displayValue = symbol ? `0 ${symbol}` : '0';
                console.log(`[Decode] INLINE formatted: "${displayValue}"`);
                params[paramName] = rawValue;
                formatted[paramName] = {
                  label: fieldDef?.label || toTitleCase(paramName),
                  value: displayValue,
                  rawValue: rawValue,
                  format: fieldDef?.format || (input.type === 'address' ? 'address' :
                                               input.type === 'uint256' ? 'token' : 'raw'),
                  params: fieldDef?.params || {}
                };
                continue;
              }
              const fullFraction = fractionalPart.toString().padStart(dec, '0');
              let fractionalStr = fullFraction.replace(/0+$/, '');
              const maxDisplay = 6;
              const minDisplay = 2; // Minimum 2 decimal places for standard amounts
              if (integerPart === 0n && fractionalPart > 0n) {
                const firstNonZero = fullFraction.search(/[1-9]/);
                if (firstNonZero !== -1) {
                  const end = Math.min(firstNonZero + maxDisplay, fullFraction.length);
                  fractionalStr = fullFraction.slice(0, end).replace(/0+$/, '');
                }
              }
              // Ensure minimum 2 decimal places for readability (unless very small amount)
              if (fractionalStr.length < minDisplay && integerPart < 1000n) {
                fractionalStr = fullFraction.slice(0, minDisplay);
              }
              if (fractionalStr === '') fractionalStr = '0';
              if (fractionalStr.length > maxDisplay) fractionalStr = fractionalStr.slice(0, maxDisplay);
              displayValue = symbol ? `${integerPart}.${fractionalStr} ${symbol}` : `${integerPart}.${fractionalStr}`;
              console.log(`[Decode] INLINE formatted: "${displayValue}"`);
            } catch (e) {
              console.error('[Decode] Inline format error:', e);
              displayValue = rawValue;
            }
          }
        }

        params[paramName] = rawValue;

        formatted[paramName] = {
          label: fieldDef?.label || toTitleCase(paramName),
          value: displayValue,
          rawValue: rawValue,
          format: fieldDef?.format || (input.type === 'address' ? 'address' :
                                       input.type === 'uint256' ? 'token' : 'raw'),
          params: fieldDef?.params || {}
        };
      }
    } else {
      // Fallback when we only have function name, no ABI
      params.data = data.slice(10);
      formatted.data = {
        label: 'Transaction Data',
        value: data.slice(10),
        format: 'raw'
      };
    }

    // Handle composite intent (ERC-7730 command registries)
    let finalIntent;
    let decodedCommands = null;

    if (intent && typeof intent === 'object' && intent.type === 'composite') {
      const intentConfig = intent.config;
      const registryName = intentConfig.registry;
      const registry = commandRegistries[registryName];
      const sourceParam = intentConfig.source; // e.g., 'commands'

      // Get the commands and inputs parameters from rawParams (not stringified)
      const commandsValue = rawParams[sourceParam];
      const inputsValue = rawParams['inputs']; // Universal Router uses 'inputs' array

      if (commandsValue && registry) {
        // Decode commands using the registry
        decodedCommands = await decodeCommandArray(commandsValue, inputsValue, registry, chainId);
        finalIntent = buildCompositeIntent(intentConfig, decodedCommands);
        console.log('[Decode] Built composite intent:', finalIntent);
      } else {
        finalIntent = 'Execute commands';
        console.log('[Decode] Missing commands or registry for composite intent');
      }
    } else if (intent && typeof intent === 'object' && intent.type === 'interpolated') {
      // ERC-7730 interpolatedIntent - process template with field values
      const template = intent.template;
      console.log('[Decode] Processing interpolatedIntent template:', template);
      // Pass format.fields so we can apply formatters to nested paths (async for API token lookups)
      finalIntent = await substituteInterpolatedIntent(template, rawParams, format.fields || [], chainId);
      console.log('[Decode] Interpolated result:', finalIntent);
    } else {
      // Standard intent handling
      // Inject {value} into intent, but skip if value is zero (prevents "Execute 0" for Safe transactions)
      if (formatted.value && typeof intent === 'string') {
        const formattedVal = formatted.value.value || '';
        // Check if value is non-zero and meaningful (not just "0", "0x0", "0.00")
        const valueIsZero = formattedVal === '0' ||
                            formattedVal === '0x0' ||
                            formattedVal === '0.00' ||
                            formattedVal === '0.00 ETH' ||
                            formattedVal === '0 ETH';

        // Only inject {value} if the value is non-zero
        // This avoids "Execute 0" for Safe transactions with value=0
        if (!valueIsZero) {
          const firstWord = intent.split(/\s+/)[0];
          intent = firstWord + ' {value}';
        }
      }

      // Substitute template variables in intent (e.g., "Swap {amount} {token}")
      // Pass rawParams for nested object path resolution (e.g., "data.fromAmount" for tuples)
      finalIntent = substituteIntentTemplate(intent, params, formatted, rawParams);
    }

    // Decode nested calldata fields (ERC-7730 calldata format)
    const nestedIntents = [];
    if (fieldInfo && Object.keys(fieldInfo).length > 0) {
      for (const [fieldPath, fieldDef] of Object.entries(fieldInfo)) {
        if (fieldDef.format === 'calldata') {
          const calldataValue = rawParams[fieldPath];
          if (typeof calldataValue === 'string' && calldataValue.startsWith('0x') && calldataValue.length > 10) {
            let target = fieldDef.calldataTarget;
            if (typeof target === 'string') {
              if (target.startsWith('$.')) {
                target = resolveJsonPath(target, rawParams);
              } else if (rawParams[target]) {
                target = rawParams[target];
              }
            }

            if (target && window.decodeCalldataRecursive) {
              try {
                const nested = await window.decodeCalldataRecursive(calldataValue, target, chainId);
                if (nested?.success) {
                  if (nested.nestedIntents?.length) {
                    nestedIntents.push(...nested.nestedIntents);
                  } else if (nested.intent && nested.intent !== 'Contract interaction') {
                    nestedIntents.push(nested.intent);
                  }
                }
              } catch (e) {
                // Ignore nested decode failures
              }
            }
          }
        }
      }
    }

    const aggregatedIntent = nestedIntents.length ? nestedIntents.join(' + ') : undefined;
    if (aggregatedIntent) {
      finalIntent = aggregatedIntent;
    }

    return {
      success: true,
      selector,
      function: functionSignature,
      functionName,
      params,
      rawParams,
      intent: finalIntent,
      formatted,
      decodedCommands, // Include decoded commands for display
      nestedIntents,
      aggregatedIntent
    };
    
  } catch (error) {
    console.error('[Decode] Error:', error.message);
    return {
      success: false,
      selector: data.slice(0, 10),
      intent: 'Contract interaction',
      error: error.message
    };
  }
}

// Helper functions

/**
 * Format token amount with decimals
 * @param {string} rawValue - Raw integer value as string
 * @param {number} decimals - Number of decimals
 * @param {string} symbol - Token symbol
 * @returns {string} - Formatted amount like "1.5 USDC"
 */
function formatTokenAmount(rawValue, decimals, symbol) {
  console.log('[formatTokenAmount] CALLED with:', { rawValue, decimals, symbol, rawValueType: typeof rawValue, decimalsType: typeof decimals });
  try {
    // Ensure decimals is a number
    const dec = Number(decimals);
    console.log('[formatTokenAmount] dec after Number():', dec);
    if (isNaN(dec) || dec < 0) {
      console.warn('[formatTokenAmount] Invalid decimals:', decimals);
      return rawValue;
    }

    // Handle empty or invalid hex values
    if (!rawValue || rawValue === '0x' || rawValue === '0x0') {
      return symbol ? `0 ${symbol}` : '0';
    }

    const value = BigInt(rawValue);
    console.log('[formatTokenAmount] value as BigInt:', value.toString());
    const divisor = BigInt(10) ** BigInt(dec);
    console.log('[formatTokenAmount] divisor:', divisor.toString());
    const integerPart = value / divisor;
    const fractionalPart = value % divisor;
    if (value === 0n) {
      return symbol ? `0 ${symbol}` : '0';
    }
    console.log('[formatTokenAmount] integerPart:', integerPart.toString(), 'fractionalPart:', fractionalPart.toString());

    // Format fractional part with leading zeros (full precision)
    const fullFraction = fractionalPart.toString().padStart(dec, '0');
    console.log('[formatTokenAmount] fractionalStr after padStart:', fullFraction);

    const maxDisplay = 6;
    const minDisplay = 2; // Minimum 2 decimal places for standard amounts
    let fractionalStr = fullFraction.replace(/0+$/, '');

    // Ensure small non-zero values show at least one significant digit
    if (integerPart === 0n && fractionalPart > 0n) {
      const firstNonZero = fullFraction.search(/[1-9]/);
      if (firstNonZero !== -1) {
        const end = Math.min(firstNonZero + maxDisplay, fullFraction.length);
        fractionalStr = fullFraction.slice(0, end).replace(/0+$/, '');
      }
    }

    // Ensure minimum 2 decimal places for readability (unless very small amount)
    if (fractionalStr.length < minDisplay && integerPart < 1000n) {
      fractionalStr = fullFraction.slice(0, minDisplay);
    }

    if (fractionalStr === '') fractionalStr = '0';
    if (fractionalStr.length > maxDisplay) fractionalStr = fractionalStr.slice(0, maxDisplay);

    console.log('[formatTokenAmount] fractionalStr final:', fractionalStr);

    const formatted = `${integerPart}.${fractionalStr}`;
    const result = symbol ? `${formatted} ${symbol}` : formatted;
    console.log('[formatTokenAmount] RESULT:', result);
    return result;
  } catch (e) {
    console.error('[formatTokenAmount] Error:', e, 'rawValue:', rawValue, 'decimals:', decimals);
    return rawValue;
  }
}

/**
 * Decode Universal Router command array using registry
 * @param {string} commands - Hex string of command bytes (e.g., "0x0b00")
 * @param {Array} inputs - Array of ABI-encoded input data for each command
 * @param {Object} registry - Command registry mapping byte codes to definitions
 * @returns {Array} - Array of decoded command objects with intents
 */
async function decodeCommandArray(commands, inputs, registry, chainId = 1) {
  if (!commands || !registry) return [];

  // Remove 0x prefix if present
  const commandBytes = commands.startsWith('0x') ? commands.slice(2) : commands;
  const results = [];

  const getTokenInfo = async (tokenAddress) => {
    if (!tokenAddress) return { symbol: '', decimals: 18 };
    const normalized = tokenAddress.toLowerCase();
    if (normalized === '0x0000000000000000000000000000000000000000' ||
        normalized === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
      return { symbol: 'ETH', decimals: 18 };
    }
    try {
      const tokenInfo = await window.metadataService.getTokenMetadata(tokenAddress, chainId);
      return { symbol: tokenInfo.symbol || '', decimals: tokenInfo.decimals || 18 };
    } catch {
      return { symbol: `${tokenAddress.slice(0, 6)}...${tokenAddress.slice(-4)}`, decimals: 18 };
    }
  };

  const parseV3Path = (pathHex) => {
    if (!pathHex) return null;
    const hex = pathHex.startsWith('0x') ? pathHex.slice(2) : pathHex;
    if (hex.length < 40) return null;
    const tokenIn = '0x' + hex.slice(0, 40);
    const tokenOut = '0x' + hex.slice(hex.length - 40);
    return { tokenIn, tokenOut };
  };

  for (let i = 0; i < commandBytes.length; i += 2) {
    const cmdByte = '0x' + commandBytes.slice(i, i + 2).toLowerCase();
    const cmdDef = registry[cmdByte];
    const inputData = inputs?.[i / 2];

    if (cmdDef) {
      let decodedParams = {};
      let intent = cmdDef.intent || cmdDef.name;

      // Try to decode input data if available and command has input definitions
      if (inputData && cmdDef.inputs && Array.isArray(cmdDef.inputs)) {
        try {
          // Create a mock ABI for decoding
          const mockAbi = {
            type: 'function',
            name: 'decode',
            inputs: cmdDef.inputs
          };
          const iface = new SimpleInterface([mockAbi]);
          // Input data is already without selector, add a fake selector for decoding
          const fakeCalldata = '0x00000000' + (inputData.startsWith('0x') ? inputData.slice(2) : inputData);
          const decoded = iface.decodeFunctionData('decode', fakeCalldata);

          // Map decoded values to parameter names
          for (let j = 0; j < cmdDef.inputs.length && j < decoded.length; j++) {
            const paramDef = cmdDef.inputs[j];
            let value = decoded[j];

            // Handle BigNumber-like objects
            if (value && typeof value === 'object' && '_isBigNumber' in value) {
              value = value._value || (value._hex ? BigInt(value._hex).toString() : String(value));
            }

            // Apply format if specified
            if (paramDef.format === 'ethAmount' && value) {
              try {
                value = formatTokenAmount(value.toString(), 18, 'ETH');
              } catch {}
            } else if (paramDef.format === 'tokenAmount' && value) {
              value = value.toString();
            }

            decodedParams[paramDef.name] = value;
          }

          // Enhance swap intents with token symbols/decimals when path is present
          if (cmdDef.name && cmdDef.name.toUpperCase().includes('SWAP')) {
            let tokenInAddr;
            let tokenOutAddr;

            const pickAddr = (val) => {
              if (!val) return null;
              if (typeof val === 'string' && /^0x[a-fA-F0-9]{40}$/.test(val)) return val;
              return null;
            };

            // V3/V2 path support
            if (decodedParams.path && typeof decodedParams.path === 'string') {
              const parsed = parseV3Path(decodedParams.path);
              if (parsed) {
                tokenInAddr = parsed.tokenIn;
                tokenOutAddr = parsed.tokenOut;
              }
            } else if (Array.isArray(decodedParams.path)) {
              tokenInAddr = decodedParams.path[0];
              tokenOutAddr = decodedParams.path[decodedParams.path.length - 1];
            }

            // V4-style or generic param naming
            if (!tokenInAddr || !tokenOutAddr) {
              const directIn = pickAddr(decodedParams.tokenIn || decodedParams.currencyIn || decodedParams.currency0 || decodedParams.token0);
              const directOut = pickAddr(decodedParams.tokenOut || decodedParams.currencyOut || decodedParams.currency1 || decodedParams.token1);
              tokenInAddr = tokenInAddr || directIn;
              tokenOutAddr = tokenOutAddr || directOut;
            }

            // Nested poolKey/common structs
            if ((!tokenInAddr || !tokenOutAddr) && decodedParams.poolKey && typeof decodedParams.poolKey === 'object') {
              const poolKey = decodedParams.poolKey;
              const pkIn = pickAddr(poolKey.currency0 || poolKey.token0 || poolKey.currencyIn || poolKey.tokenIn);
              const pkOut = pickAddr(poolKey.currency1 || poolKey.token1 || poolKey.currencyOut || poolKey.tokenOut);
              tokenInAddr = tokenInAddr || pkIn;
              tokenOutAddr = tokenOutAddr || pkOut;
            }

            if (tokenInAddr && tokenOutAddr) {
              const [tokenInInfo, tokenOutInfo] = await Promise.all([
                getTokenInfo(tokenInAddr),
                getTokenInfo(tokenOutAddr)
              ]);

              const formatAmount = (raw, info) => {
                if (!raw && raw !== 0) return raw;
                return formatTokenAmount(raw.toString(), info.decimals, info.symbol);
              };

              if (decodedParams.amountIn !== undefined && decodedParams.amountOutMin !== undefined) {
                const amountIn = formatAmount(decodedParams.amountIn, tokenInInfo);
                const amountOutMin = formatAmount(decodedParams.amountOutMin, tokenOutInfo);
                intent = `Swap ${amountIn} for min ${amountOutMin}`;
              } else if (decodedParams.amountOut !== undefined && decodedParams.amountInMax !== undefined) {
                const amountOut = formatAmount(decodedParams.amountOut, tokenOutInfo);
                const amountInMax = formatAmount(decodedParams.amountInMax, tokenInInfo);
                intent = `Swap for exactly ${amountOut} (max ${amountInMax})`;
              }
            }
          }

          // Apply tokenAmount formatting using metadata tokenPath (ERC-7730)
          for (const paramDef of cmdDef.inputs) {
            if (paramDef.format === 'tokenAmount' && paramDef.params?.tokenPath) {
              const rawVal = decodedParams[paramDef.name];
              if (rawVal !== undefined && rawVal !== null) {
                try {
                  const formattedVal = await applyFieldFormat(rawVal, paramDef, decodedParams, chainId);
                  decodedParams[paramDef.name] = formattedVal;
                } catch {}
              }
            }
          }

          // Substitute template variables in intent (fallback)
          if (!intent || intent === cmdDef.intent || intent === cmdDef.name) {
            intent = substituteCommandIntent(cmdDef.intent || cmdDef.name, decodedParams);
          }
        } catch (e) {
          console.log('[decodeCommandArray] Failed to decode input for command', cmdByte, e.message);
        }
      }

      results.push({
        command: cmdByte,
        name: cmdDef.name,
        intent: intent,
        params: decodedParams
      });
    } else {
      results.push({
        command: cmdByte,
        name: `UNKNOWN_${cmdByte}`,
        intent: `Unknown command ${cmdByte}`,
        params: {}
      });
    }
  }

  return results;
}

/**
 * Substitute template variables in command intent string
 * @param {string} template - Intent template with {variable} placeholders
 * @param {object} params - Decoded parameter values
 * @returns {string} - Intent with substituted values
 */
function substituteCommandIntent(template, params) {
  if (!template || typeof template !== 'string') return template;
  if (!template.includes('{')) return template;

  return template.replace(/\{(\w+)\}/g, (match, paramName) => {
    if (params && params[paramName] !== undefined) {
      return params[paramName];
    }
    return match;
  });
}

/**
 * Build composite intent from decoded command operations
 * @param {Object} intentConfig - Intent configuration with type, separator, etc.
 * @param {Array} decodedCommands - Array of decoded command objects
 * @returns {string} - Combined intent string
 */
function buildCompositeIntent(intentConfig, decodedCommands) {
  if (!decodedCommands || decodedCommands.length === 0) {
    return 'Execute commands';
  }

  const separator = intentConfig.separator || ' + ';
  const intents = decodedCommands.map(cmd => cmd.intent);

  // Handle maxDisplay limit
  if (intentConfig.maxDisplay && intents.length > intentConfig.maxDisplay) {
    const shown = intents.slice(0, intentConfig.maxDisplay);
    const overflow = intentConfig.overflow || `and ${intents.length - intentConfig.maxDisplay} more`;
    return shown.join(separator) + separator + overflow;
  }

  return intents.join(separator);
}

/**
 * Substitute template variables in intent string
 * Supports {paramName} syntax for simple params
 * Supports {paramName:format} for formatted values (e.g., {amount:token})
 * @param {string} template - Intent template with {variable} placeholders
 * @param {object} params - Raw parameter values
 * @param {object} formatted - Formatted parameter values with labels
 * @returns {string} - Intent with substituted values
 */
function substituteIntentTemplate(template, params, formatted, rawParams = {}) {
  if (!template || typeof template !== 'string') return template;

  // Check if template has any placeholders
  if (!template.includes('{')) return template;

  let result = template;

  // Replace {paramName} or {paramName:format} or {nested.path} or {#.path.[0].field} patterns
  // Support ERC-7730 syntax: #. for parameters, [n] for array indices
  const regex = /\{([#@]?[\w.\[\]]+)(?::(\w+))?\}/g;
  result = result.replace(regex, (match, paramPath, formatType) => {
    // Helper to get nested value by path (e.g., "data.fromAmount" or "#._swapData.[0].fromAmount")
    const getNestedValue = (obj, path) => {
      if (!obj) return undefined;

      // Handle ERC-7730 path syntax: #._swapData.[0].fromAmount
      // Split by dots but preserve array indices [n]
      let currentPath = path;

      // Remove #. or @. prefix - they just indicate the root
      if (currentPath.startsWith('#.') || currentPath.startsWith('@.')) {
        currentPath = currentPath.substring(2);
      }

      const parts = currentPath.split('.').filter(p => p);
      let value = obj;

      for (const part of parts) {
        if (value === undefined || value === null) return undefined;

        // Handle array index syntax: [0] or [1]
        const arrayMatch = part.match(/^(.+?)\[(\d+)\]$/);
        if (arrayMatch) {
          const fieldName = arrayMatch[1];
          const index = parseInt(arrayMatch[2]);

          // First access the field name if it exists
          if (fieldName) {
            value = value[fieldName];
            if (value === undefined || value === null) return undefined;
          }

          // Then access the array index
          if (Array.isArray(value)) {
            value = value[index];
          } else {
            return undefined;
          }
        } else {
          value = value[part];
        }
      }
      return value;
    };

    // Try formatted value first - check direct key lookup before nested navigation
    // formatted object stores values by path as key: formatted["#._swapData.[0].fromAmount"]
    let formattedValue = formatted[paramPath];

    // If not found by direct key, try nested navigation
    if (!formattedValue) {
      formattedValue = getNestedValue(formatted, paramPath);
    }

    if (formattedValue) {
      if (formatType === 'label') {
        return formattedValue.label || paramPath;
      }
      let value = formattedValue.value || match;

      // Check if template has a token symbol immediately after this placeholder
      // e.g., "Approve {amount} USDC" with value "0.50 USDC" → avoid "0.50 USDC USDC"
      const matchIndex = result.indexOf(match);
      if (matchIndex !== -1) {
        const afterMatch = result.slice(matchIndex + match.length);
        const symbolMatch = afterMatch.match(/^\s+(USDC|USDT|DAI|WETH|ETH|WBTC|MATIC|BNB|AVAX|FTM|ARB|OP|[A-Z]{2,6})\b/i);
        if (symbolMatch && value.toUpperCase().endsWith(symbolMatch[1].toUpperCase())) {
          // Remove the duplicate symbol from the end of the value
          value = value.replace(new RegExp(`\\s*${symbolMatch[1]}$`, 'i'), '');
        }
      }

      return value;
    }

    // Fall back to raw params - try rawParams first for nested object paths
    const rawObjValue = getNestedValue(rawParams, paramPath);
    if (rawObjValue !== undefined && rawObjValue !== null) {
      // Format as string for display
      if (typeof rawObjValue === 'object' && '_isBigNumber' in rawObjValue) {
        return rawObjValue._value || (rawObjValue._hex ? BigInt(rawObjValue._hex).toString() : String(rawObjValue));
      }
      return String(rawObjValue);
    }

    // Try stringified params as fallback
    const rawValue = getNestedValue(params, paramPath);
    if (rawValue !== undefined) {
      return rawValue;
    }

    // Return original placeholder if not found
    return match;
  });

  return result;
}

/**
 * ERC-7730 compliant interpolatedIntent processor (async for API-based token lookups)
 * Per spec: "For each expression, the wallet MUST resolve the path and locate the
 * corresponding field format specification in the fields array"
 * @param {string} template - interpolatedIntent template with {path} placeholders
 * @param {object} rawParams - Decoded parameters
 * @param {Array} fields - Field specifications from metadata
 * @param {number} chainId - Chain ID for token metadata lookups
 * @returns {Promise<string>} - Intent with formatted values interpolated
 */
async function substituteInterpolatedIntent(template, rawParams, fields, chainId = 1) {
  if (!template || typeof template !== 'string') return template;
  if (!template.includes('{')) return template;

  console.log('[interpolatedIntent] Template:', template);
  console.log('[interpolatedIntent] Fields:', fields);

  const regex = /\{([#@]?[\w.\[\]]+)(?::(\w+))?\}/g;

  // Collect all matches first
  const matches = [];
  let match;
  while ((match = regex.exec(template)) !== null) {
    matches.push({
      fullMatch: match[0],
      pathStr: match[1],
      formatType: match[2]
    });
  }

  // Process all matches async (fetch token metadata in parallel)
  const replacements = await Promise.all(matches.map(async ({ fullMatch, pathStr, formatType }) => {
    console.log(`[interpolatedIntent] Processing ${fullMatch}, pathStr="${pathStr}"`);

    // Find field spec for this path
    const fieldSpec = fields.find(f => f.path === pathStr);
    if (!fieldSpec) {
      console.warn(`[interpolatedIntent] No field spec found for path: ${pathStr}`);
      return { match: fullMatch, value: fullMatch };
    }

    console.log('[interpolatedIntent] Found field spec:', fieldSpec);

    // Navigate to the value using the path
    const value = resolveFieldPath(pathStr, rawParams);
    if (value === undefined || value === null) {
      console.warn(`[interpolatedIntent] No value found for path: ${pathStr}`);
      return { match: fullMatch, value: fullMatch };
    }

    console.log('[interpolatedIntent] Resolved value:', value);

    // Apply the field's format and params (ERC-7730 requirement) - async for token lookups
    const formatted = await applyFieldFormat(value, fieldSpec, rawParams, chainId);
    console.log('[interpolatedIntent] Formatted value:', formatted);

    return { match: fullMatch, value: formatted };
  }));

  // Apply all replacements
  let result = template;
  for (const { match, value } of replacements) {
    result = result.replace(match, value);
  }

  return result;
}

/**
 * Resolve a field path to its value in decoded params
 * Supports ERC-7730 syntax: #._swapData.[0].fromAmount
 */
function resolveFieldPath(pathStr, params) {
  // Remove #. or @. prefix
  let currentPath = pathStr;
  if (currentPath.startsWith('#.') || currentPath.startsWith('@.')) {
    currentPath = currentPath.substring(2);
  }

  const parts = currentPath.split('.').filter(p => p);
  let value = params;

  for (const part of parts) {
    if (value === undefined || value === null) return undefined;

    // Handle slice selector: path.[0:19] or path.[-20:-1]
    const sliceMatch = part.match(/^(.+?)?\[(-?\d+):(-?\d+)\]$/);
    // Handle array index: _swapData[0] or [0]
    const arrayMatch = part.match(/^(.+?)?\[(\d+)\]$/);

    if (sliceMatch) {
      const fieldName = sliceMatch[1];
      const startIdx = parseInt(sliceMatch[2]);
      const endIdx = parseInt(sliceMatch[3]);

      if (fieldName) {
        value = value[fieldName];
        if (value === undefined || value === null) return undefined;
      }

      if (typeof value === 'string') {
        const hex = value.startsWith('0x') ? value.slice(2) : value;
        const byteLen = Math.floor(hex.length / 2);
        const start = startIdx < 0 ? byteLen + startIdx : startIdx;
        const end = endIdx < 0 ? byteLen + endIdx : endIdx;
        if (start < 0 || end < start || start >= byteLen) return undefined;
        const sliceHex = hex.slice(start * 2, (end + 1) * 2);
        return '0x' + sliceHex;
      }

      if (Array.isArray(value)) {
        const start = startIdx < 0 ? value.length + startIdx : startIdx;
        const end = endIdx < 0 ? value.length + endIdx : endIdx;
        return value.slice(start, end + 1);
      }

      return undefined;
    } else if (arrayMatch) {
      const fieldName = arrayMatch[1];
      const index = parseInt(arrayMatch[2]);

      if (fieldName) {
        value = value[fieldName];
        if (value === undefined || value === null) return undefined;
      }

      if (Array.isArray(value)) {
        value = value[index];
      } else {
        return undefined;
      }
    } else {
      value = value[part];
    }
  }

  return value;
}

/**
 * Apply ERC-7730 field format to a value (async - fetches token metadata from API)
 */
async function applyFieldFormat(value, fieldSpec, allParams, chainId = 1) {
  const format = fieldSpec.format;
  const params = fieldSpec.params || {};

  console.log(`[applyFieldFormat] format="${format}", value=`, value, 'params=', params);

  // tokenAmount format - fetch token metadata from Railway API
  if (format === 'tokenAmount') {
    const tokenPath = params.tokenPath;
    if (!tokenPath) {
      console.warn('[applyFieldFormat] tokenAmount format missing tokenPath');
      return String(value);
    }

    // Resolve token address from params
    const tokenAddress = resolveFieldPath(tokenPath, allParams);
    console.log('[applyFieldFormat] Token address:', tokenAddress);

    let decimals = 18; // Default
    let symbol = '';

    if (tokenAddress) {
      // Handle native ETH addresses
      const normalizedAddr = tokenAddress.toLowerCase();
      if (normalizedAddr === '0x0000000000000000000000000000000000000000' ||
          normalizedAddr === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
        decimals = 18;
        symbol = 'ETH';
      } else {
        // Fetch token metadata from Railway API
        try {
          const tokenInfo = await window.metadataService.getTokenMetadata(tokenAddress, chainId);
          console.log('[applyFieldFormat] Token info from API:', tokenInfo);
          decimals = tokenInfo.decimals || 18;
          symbol = tokenInfo.symbol || '';
        } catch (error) {
          console.warn('[applyFieldFormat] Failed to fetch token metadata:', error.message);
          symbol = `${tokenAddress.slice(0, 6)}...${tokenAddress.slice(-4)}`;
        }
      }
    }

    console.log(`[applyFieldFormat] Resolved token: ${symbol} (${decimals} decimals)`);

    // Convert value to string - handle BigNumber objects from ethers.js
    let valueStr;
    if (value && typeof value === 'object') {
      if (value._isBigNumber && value._hex) {
        // ethers.js BigNumber - convert hex to decimal string
        valueStr = BigInt(value._hex).toString();
      } else if (typeof value.toString === 'function') {
        valueStr = value.toString();
      } else {
        valueStr = String(value);
      }
    } else {
      valueStr = String(value);
    }
    console.log(`[applyFieldFormat] Value string: ${valueStr}`);

    // Format the amount
    return formatTokenAmount(valueStr, decimals, symbol);
  }

  // addressName format
  if (format === 'addressName') {
    // TODO: Resolve ENS/address book
    return String(value);
  }

  // Raw fallback - handle BigNumber objects
  if (value && typeof value === 'object' && '_isBigNumber' in value) {
    return value._value || (value._hex ? BigInt(value._hex).toString() : String(value));
  }
  return String(value);
}

function toTitleCase(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Extract calldata field definitions from ERC-7730 format structure
 * Recursively walks the format array to find all calldata fields
 * @param {Array} formatArray - Format array from metadata
 * @param {object} fieldInfo - Object to populate with field info
 */
function extractCalldataFieldsFromFormat(formatArray, fieldInfo) {
  if (!Array.isArray(formatArray)) return;

  for (const item of formatArray) {
    // Check if this item is a calldata field
    if (item.type === 'calldata' && item.path) {
      fieldInfo[item.path] = {
        label: item.label || item.path,
        format: item.format || 'calldata',
        type: 'calldata',
        calldataTarget: item.to || null
      };
    }

    // Check if this item is a multicallDecoder field
    if (item.type === 'multicallDecoder' && item.path) {
      fieldInfo[item.path] = {
        label: item.label || item.path,
        format: item.format || {},
        type: 'multicallDecoder'
      };
    }

    // Recursively process nested fields (containers, etc.)
    if (item.fields && Array.isArray(item.fields)) {
      extractCalldataFieldsFromFormat(item.fields, fieldInfo);
    }
  }
}

function extractFunctionSelector(data) {
  if (!data || typeof data !== 'string') return null;
  if (!data.startsWith('0x')) data = '0x' + data;
  if (data.length < 10) return null;
  return data.slice(0, 10).toLowerCase();
}

/**
 * Resolve JSONPath reference to actual value from decoded params
 * Supports ERC-7730 style paths: $.fieldName, $.nested.field, $.array[0]
 * Used for resolving "to": "$.to" references in calldata field definitions
 *
 * @param {string} path - JSONPath like "$.to" or "$.message.recipient" or "$._singleton"
 * @param {object} params - Decoded parameters object
 * @returns {any} - Resolved value or null if not found
 */
function resolveJsonPath(path, params) {
  if (!path || typeof path !== 'string') return path;

  // Must start with "$." to be a JSONPath reference
  if (!path.startsWith('$.')) return path;

  // Remove "$." prefix
  const pathParts = path.slice(2).split('.');
  let current = params;

  for (const part of pathParts) {
    if (current === null || current === undefined) return null;

    // Handle array indices like "items[0]" or "tokens[1]"
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, fieldName, indexStr] = arrayMatch;
      const index = parseInt(indexStr, 10);
      current = current[fieldName];
      if (Array.isArray(current) && index < current.length) {
        current = current[index];
      } else {
        return null;
      }
    } else {
      current = current[part];
    }
  }

  // Handle BigNumber-like objects
  if (current && typeof current === 'object' && '_isBigNumber' in current) {
    return current.toString();
  }

  return current;
}

// Export resolveJsonPath globally for recursive decoder
window.resolveJsonPath = resolveJsonPath;

// Get metadata from our metadata service
async function getContractMetadata(contractAddress, chainId, selector = null) {
  if (!window.metadataService) {
    return null;
  }
  return await window.metadataService.getContractMetadata(contractAddress, chainId, selector);
}

// Export globally - formatTokenAmount is defined earlier with (rawValue, decimals, symbol) signature
window.decodeCalldata = decodeCalldata;
window.formatTokenAmount = formatTokenAmount;

// Decoder ready
