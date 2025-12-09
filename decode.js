// Pure dynamic decoder - NO HARDCODED METADATA
// KaiSign dynamic decoder

// Enhanced ABI decoder - supports all Solidity types including bytes, bytes[], arrays
// NO HARDCODED SELECTORS - all type handling is generic
class SimpleInterface {
  constructor(abi) {
    this.abi = Array.isArray(abi) ? abi : [abi];
  }

  /**
   * Check if a type is dynamic (requires offset resolution)
   * @param {string} type - Solidity type
   * @returns {boolean}
   */
  isDynamicType(type) {
    if (!type) return false;
    // bytes, string, and any array type are dynamic
    if (type === 'bytes' || type === 'string') return true;
    if (type.endsWith('[]')) return true;
    // Tuples with dynamic components are dynamic
    if (type === 'tuple') return false; // Will be checked separately
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
          value: { _isBigNumber: true, _hex: '0x' + hexValue, toString: () => value.toString() },
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
          value: { _isBigNumber: true, _hex: '0x' + hexValue, toString: () => value.toString() },
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
        if (this.isDynamicType(component.type)) {
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

      if (this.isDynamicType(baseType)) {
        // Array of dynamic elements (e.g., bytes[], string[])
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

      if (this.isDynamicType(input.type)) {
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
    const metadata = await getContractMetadata(contractAddress, chainId, selector);

    // If no contract-specific metadata, try registry fallback
    if (!metadata) {
      if (window.registryLoader?.selectorRegistry) {
        const selectorInfo = window.registryLoader.selectorRegistry.get(selector);
        if (selectorInfo?.signature) {
          // Get token info if available
          const tokenInfo = window.registryLoader?.tokenRegistry?.get(contractAddress.toLowerCase());
          const tokenSymbol = tokenInfo?.symbol || 'tokens';
          const tokenDecimals = tokenInfo?.decimals || 18;

          const result = {
            success: true,
            selector,
            functionName: selectorInfo.name,
            functionSignature: selectorInfo.signature,
            intent: selectorInfo.intent || selectorInfo.name,
            params: {},
            formatted: {},
            rawParams: data.slice(10),
            source: 'registry',
            tokenInfo
          };

          // Try to decode params using signature
          const sigMatch = selectorInfo.signature.match(/^(\w+)\(([^)]*)\)$/);
          if (sigMatch && sigMatch[2]) {
            const paramTypes = sigMatch[2].split(',').map(t => t.trim());
            // Known param names for common functions
            const paramNames = {
              'approve': ['spender', 'amount'],
              'transfer': ['to', 'amount'],
              'transferFrom': ['from', 'to', 'amount']
            };
            const names = paramNames[selectorInfo.name] || paramTypes.map((t, i) => `param${i}`);

            try {
              const minimalAbi = {
                type: 'function',
                name: selectorInfo.name,
                inputs: paramTypes.map((t, i) => ({ type: t, name: names[i] || `param${i}` }))
              };
              const iface = new SimpleInterface([minimalAbi]);
              const decoded = iface.decodeFunctionData(selectorInfo.name, data);
              if (decoded) {
                decoded.forEach((val, i) => {
                  const name = names[i] || `param${i}`;
                  const type = paramTypes[i];
                  result.params[name] = val;

                  // Format based on type
                  if (type === 'address') {
                    result.formatted[name] = { label: toTitleCase(name), value: val, format: 'address' };
                  } else if (type === 'uint256' && name === 'amount') {
                    // Format amount with token info - use contractAddress for token lookup
                    const formattedAmount = formatTokenAmount(val, contractAddress, chainId);
                    result.formatted[name] = { label: 'Amount', value: formattedAmount, format: 'token' };
                  } else {
                    result.formatted[name] = { label: toTitleCase(name), value: String(val), format: 'raw' };
                  }
                });

                // Build better intent with token info
                if (selectorInfo.name === 'approve' && result.params.amount) {
                  const amt = formatTokenAmount(result.params.amount, contractAddress, chainId);
                  result.intent = `Approve ${amt}`;
                } else if (selectorInfo.name === 'transfer' && result.params.amount) {
                  const amt = formatTokenAmount(result.params.amount, contractAddress, chainId);
                  result.intent = `Transfer ${amt}`;
                }
              }
            } catch (e) { /* ignore decode errors */ }
          }
          return result;
        }
      }

      return {
        success: false,
        selector,
        intent: 'Contract interaction',
        error: 'No metadata found'
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

          // Calculate selector if not stored
          let calculatedSelector = null;
          if (typeof window !== 'undefined') {
            if (window.ethereum?.utils?.keccak256) {
              try { calculatedSelector = window.ethereum.utils.keccak256(signature).slice(0, 10); } catch {}
            }
            if (!calculatedSelector && window.web3?.utils) {
              try { calculatedSelector = window.web3.utils.keccak256(signature).slice(0, 10); } catch {}
            }
            if (!calculatedSelector && window.ethers?.utils) {
              try { calculatedSelector = window.ethers.utils.keccak256(window.ethers.utils.toUtf8Bytes(signature)).slice(0, 10); } catch {}
            }
          }

          const expectedSelector = item.selector || calculatedSelector;
          if (expectedSelector === selector) {
            functionSignature = signature;
            functionName = item.name;
            abiFunction = item;
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

    if (format) {
      // Handle ERC-7730 intent format with nested containers
      if (format.intent?.format && Array.isArray(format.intent.format)) {
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
              // Store calldata target reference for recursive decoding
              type: field.type || 'raw',
              calldataTarget: field.type === 'calldata' ? field.to : null
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
        
        let formattedValue;
        if (value && typeof value === 'object' && '_isBigNumber' in value) {
          formattedValue = value.toString();
        } else if (typeof value === 'object' && value !== null) {
          formattedValue = JSON.stringify(value);
        } else {
          formattedValue = String(value || '');
        }
        
        params[paramName] = formattedValue;
        
        // Get field info from metadata if available
        const fieldDef = fieldInfo[paramName];
        
        formatted[paramName] = {
          label: fieldDef?.label || toTitleCase(paramName),
          value: formattedValue,
          format: fieldDef?.format || (input.type === 'address' ? 'address' : 
                                       input.type === 'uint256' ? 'token' : 'raw')
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
    
    // Substitute template variables in intent (e.g., "Swap {amount} {token}")
    const finalIntent = substituteIntentTemplate(intent, params, formatted);

    return {
      success: true,
      selector,
      function: functionSignature,
      functionName,
      params,
      intent: finalIntent,
      formatted
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
 * Substitute template variables in intent string
 * Supports {paramName} syntax for simple params
 * Supports {paramName:format} for formatted values (e.g., {amount:token})
 * @param {string} template - Intent template with {variable} placeholders
 * @param {object} params - Raw parameter values
 * @param {object} formatted - Formatted parameter values with labels
 * @returns {string} - Intent with substituted values
 */
function substituteIntentTemplate(template, params, formatted) {
  if (!template || typeof template !== 'string') return template;

  // Check if template has any placeholders
  if (!template.includes('{')) return template;

  let result = template;

  // Replace {paramName} or {paramName:format} patterns
  const regex = /\{(\w+)(?::(\w+))?\}/g;
  result = result.replace(regex, (match, paramName, formatType) => {
    // Try formatted value first
    if (formatted && formatted[paramName]) {
      const formattedParam = formatted[paramName];
      // If format type specified, use it; otherwise use the value
      if (formatType === 'label') {
        return formattedParam.label || paramName;
      }
      return formattedParam.value || match;
    }

    // Fall back to raw params
    if (params && params[paramName] !== undefined) {
      return params[paramName];
    }

    // Return original placeholder if not found
    return match;
  });

  return result;
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

    // Check if this item is a multiSendDecoder field
    if (item.type === 'multiSendDecoder' && item.path) {
      fieldInfo[item.path] = {
        label: item.label || item.path,
        format: item.format || {},
        type: 'multiSendDecoder'
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

/**
 * Format token amount from wei to human-readable format
 * @param {string|number} rawAmount - Amount in wei (hex or decimal)
 * @param {string} tokenAddress - Token contract address
 * @param {number} chainId - Chain ID
 * @returns {string} - Formatted amount with symbol (e.g., "1.5 WETH")
 */
function formatTokenAmount(rawAmount, tokenAddress, chainId = 1) {
  if (!rawAmount || rawAmount === '0x0' || rawAmount === '0') {
    return '0';
  }

  try {
    // Convert hex to decimal if needed
    let amountBN;
    if (typeof rawAmount === 'string' && rawAmount.startsWith('0x')) {
      amountBN = BigInt(rawAmount);
    } else if (typeof rawAmount === 'string') {
      amountBN = BigInt(rawAmount);
    } else {
      amountBN = BigInt(rawAmount.toString());
    }

    // Get token info from registry - use existing singleton instance
    const registryLoader = window.registryLoader;
    let decimals = 18;
    let symbol = 'TOKEN';

    if (registryLoader) {
      decimals = registryLoader.getTokenDecimals(tokenAddress, chainId) || 18;
      symbol = registryLoader.getTokenSymbol(tokenAddress, chainId) || 'TOKEN';
    } else {
      console.warn('[KaiSign] Registry loader not available for token formatting');
    }

    // Check for unlimited approval (max uint256)
    const MAX_UINT256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
    if (amountBN === MAX_UINT256) {
      return `Unlimited ${symbol}`;
    }

    // Convert wei to human-readable
    const divisor = BigInt(10 ** decimals);
    const wholePart = amountBN / divisor;
    const fractionalPart = amountBN % divisor;

    // Format with up to 6 decimal places
    const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
    const trimmedFractional = fractionalStr.slice(0, 6).replace(/0+$/, '');

    let formatted = wholePart.toString();
    if (trimmedFractional) {
      formatted += '.' + trimmedFractional;
    }

    return `${formatted} ${symbol}`;
  } catch (error) {
    console.error('[KaiSign] Error formatting token amount:', error);
    return rawAmount.toString();
  }
}

// Export globally
window.decodeCalldata = decodeCalldata;
window.formatTokenAmount = formatTokenAmount;

// Decoder ready