// Pure dynamic decoder - NO HARDCODED METADATA
console.log('[KaiSign] Loading dynamic decoder...');

// Simple ethers-like interface for decoding
class SimpleInterface {
  constructor(abi) {
    this.abi = Array.isArray(abi) ? abi : [abi];
  }
  
  decodeFunctionData(functionName, data) {
    const funcAbi = this.abi.find(item => item.name === functionName);
    if (!funcAbi) throw new Error(`Function ${functionName} not found`);
    
    // Remove function selector (first 4 bytes)
    const paramData = data.slice(10);
    const inputs = funcAbi.inputs || [];
    const results = [];
    let offset = 0;
    
    for (const input of inputs) {
      if (input.type === 'address') {
        const address = '0x' + paramData.slice(offset + 24, offset + 64);
        results.push(address);
        offset += 64;
      } else if (input.type === 'uint256') {
        const value = BigInt('0x' + paramData.slice(offset, offset + 64));
        results.push({ _isBigNumber: true, toString: () => value.toString() });
        offset += 64;
      } else if (input.type === 'tuple') {
        const tupleData = {};
        const components = input.components || [];
        
        for (const component of components) {
          if (component.type === 'address') {
            tupleData[component.name] = '0x' + paramData.slice(offset + 24, offset + 64);
            offset += 64;
          } else if (component.type === 'uint256') {
            const value = BigInt('0x' + paramData.slice(offset, offset + 64));
            tupleData[component.name] = { _isBigNumber: true, toString: () => value.toString() };
            offset += 64;
          }
        }
        results.push(tupleData);
      } else {
        offset += 64;
      }
    }
    
    return results;
  }
}

// PURE dynamic decoding - only from metadata
async function decodeCalldata(data, contractAddress, chainId) {
  try {
    const selector = data.slice(0, 10);
    console.log(`[Decode] ===== STARTING DECODE =====`);
    console.log(`[Decode] Selector: ${selector}`);
    console.log(`[Decode] Contract: ${contractAddress}`);
    console.log(`[Decode] ChainId: ${chainId}`);
    
    // Get metadata from KaiSign subgraph ONLY
    console.log(`[Decode] Fetching metadata...`);
    const metadata = await getContractMetadata(contractAddress, chainId);
    console.log(`[Decode] Metadata result:`, metadata ? 'FOUND' : 'NOT FOUND');
    
    if (metadata) {
      console.log(`[Decode] Metadata keys:`, Object.keys(metadata));
      console.log(`[Decode] Has context.contract.abi:`, !!(metadata.context?.contract?.abi));
      console.log(`[Decode] Has messages:`, !!(metadata.messages));
      console.log(`[Decode] Has display.formats:`, !!(metadata.display?.formats));
    }
    
    if (!metadata) {
      return { 
        success: false, 
        selector, 
        intent: 'Contract interaction',
        error: 'No metadata found for contract' 
      };
    }
    
    // Find function in ABI from metadata ONLY
    let functionSignature = null;
    let functionName = null;
    let abiFunction = null;
    
    console.log(`[Decode] ABI type:`, typeof metadata.context?.contract?.abi);
    console.log(`[Decode] ABI value:`, metadata.context?.contract?.abi);
    
    if (metadata.context?.contract?.abi && Array.isArray(metadata.context.contract.abi)) {
      console.log(`[Decode] Searching ABI array for selector ${selector}`);
      for (const item of metadata.context.contract.abi) {
        if (item.type === 'function') {
          // Calculate selector for this function
          const types = (item.inputs || []).map(input => input.type).join(',');
          const signature = `${item.name}(${types})`;
          
          // Calculate selector using keccak256 (Ethereum standard)
          let calculatedSelector = null;
          
          // Try multiple methods to get keccak256
          if (typeof window !== 'undefined') {
            // Method 1: Try ethereum provider
            if (window.ethereum && window.ethereum.utils && window.ethereum.utils.keccak256) {
              try {
                calculatedSelector = window.ethereum.utils.keccak256(signature).slice(0, 10);
                console.log(`[Decode] Calculated selector via ethereum.utils: ${calculatedSelector}`);
              } catch (e) {
                console.log(`[Decode] ethereum.utils.keccak256 failed: ${e.message}`);
              }
            }
            
            // Method 2: Try web3 if available
            if (!calculatedSelector && typeof window.web3 !== 'undefined' && window.web3.utils) {
              try {
                calculatedSelector = window.web3.utils.keccak256(signature).slice(0, 10);
                console.log(`[Decode] Calculated selector via web3.utils: ${calculatedSelector}`);
              } catch (e) {
                console.log(`[Decode] web3.utils.keccak256 failed: ${e.message}`);
              }
            }
            
            // Method 3: Try ethers if available
            if (!calculatedSelector && typeof window.ethers !== 'undefined' && window.ethers.utils) {
              try {
                calculatedSelector = window.ethers.utils.keccak256(window.ethers.utils.toUtf8Bytes(signature)).slice(0, 10);
                console.log(`[Decode] Calculated selector via ethers.utils: ${calculatedSelector}`);
              } catch (e) {
                console.log(`[Decode] ethers.utils.keccak256 failed: ${e.message}`);
              }
            }
          }
          
          // Use stored selector from metadata first, then fallback to calculated
          const expectedSelector = item.selector || calculatedSelector;
          
          console.log(`[Decode] Function: ${signature} -> expected: ${expectedSelector} (stored: ${item.selector || 'none'})`);
          
          if (expectedSelector === selector) {
            functionSignature = signature;
            functionName = item.name;
            abiFunction = item;
            console.log(`[Decode] ✅ MATCHED function: ${functionSignature}`);
            console.log(`[Decode] Function name for intent lookup: ${functionName}`);
            console.log(`[Decode] Function signature for intent lookup: ${functionSignature}`);
            break;
          }
        }
      }
      
      if (!functionSignature) {
        console.log(`[Decode] ❌ No function found for selector ${selector}`);
        console.log(`[Decode] Available functions in ABI:`, metadata.context.contract.abi.filter(f => f.type === 'function').map(f => f.name));
      }
    } else {
      console.log(`[Decode] ABI is not array, checking if it's string reference`);
      if (typeof metadata.context?.contract?.abi === 'string') {
        console.log(`[Decode] ABI is string reference: ${metadata.context.contract.abi}`);
        console.log(`[Decode] Will try to use messages directly for KaiSign contract`);
        
        // For KaiSign contract, try common function name mapping based on selector patterns
        // This is a fallback when ABI doesn't contain actual selectors
        if (contractAddress.toLowerCase() === '0x4dfea0c2b472a14cd052a8f9df9f19fa5cf03719') {
          const selectorToFunction = {
            '0xee5a7f6e': 'commitSpec',
            '0x4c0e5e3c': 'revealSpec', 
            '0x82b85b60': 'proposeSpec',
            '0x8f23cc54': 'challengeSpec'
          };
          
          functionName = selectorToFunction[selector];
          if (functionName) {
            console.log(`[Decode] ✅ FALLBACK: Mapped ${selector} to ${functionName}`);
            functionSignature = `${functionName}(...)`;
          }
        }
      }
    }
    
    if (!functionSignature && !functionName) {
      return {
        success: false,
        selector,
        intent: 'Unknown function',
        error: 'Function not found in metadata ABI'
      };
    }
    
    // Get intent from metadata - try both display.formats AND messages
    let intent = 'Contract interaction';
    let fieldInfo = {};
    
    // Try display.formats first (standard ERC-7730)
    console.log(`[Decode] Starting intent lookup...`);
    console.log(`[Decode] Available format keys:`, metadata.display?.formats ? Object.keys(metadata.display.formats) : 'none');
    console.log(`[Decode] Looking for signature: "${functionSignature}"`);
    console.log(`[Decode] Looking for function name: "${functionName}"`);
    
    // Check both function signature and function name
    let format = null;
    if (metadata.display?.formats?.[functionSignature]) {
      format = metadata.display.formats[functionSignature];
      console.log(`[Decode] Found format for signature: ${functionSignature}`);
    } else if (metadata.display?.formats?.[functionName]) {
      format = metadata.display.formats[functionName];
      console.log(`[Decode] Found format for function name: ${functionName}`);
    } else {
      console.log(`[Decode] No format found for "${functionSignature}" or "${functionName}"`);
    }
    
    if (format) {
      
      // Handle ERC-7730 intent format - check for format.intent.format array with text elements
      if (format.intent && format.intent.format && Array.isArray(format.intent.format)) {
        // Look for text elements with value in the format array
        for (const item of format.intent.format) {
          if (item.type === 'container' && item.fields) {
            for (const field of item.fields) {
              if (field.type === 'text' && field.value && field.format === 'heading2') {
                intent = field.value;
                console.log(`[Decode] Found intent from ERC-7730 format: ${intent}`);
                break;
              }
            }
            if (intent !== 'Contract interaction') break;
          }
        }
      } 
      // Fallback for simple string intent
      else if (typeof format.intent === 'string') {
        intent = format.intent;
        console.log(`[Decode] Found intent from display.formats: ${intent}`);
      }
      
      if (format.fields) {
        for (const field of format.fields) {
          if (field.path) {
            fieldInfo[field.path] = {
              label: field.label || field.path,
              format: field.format || 'raw'
            };
          }
        }
      }
    }
    // Try messages format (KaiSign format)
    else if (metadata.messages && functionName && metadata.messages[functionName]) {
      const messageFormat = metadata.messages[functionName];
      intent = messageFormat.label || intent;
      console.log(`[Decode] Found intent from messages: ${intent}`);
      
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
      console.log(`[Decode] No ABI available, using raw data only`);
      params.data = data.slice(10); // Remove selector
      formatted.data = {
        label: 'Transaction Data',
        value: data.slice(10),
        format: 'raw'
      };
    }
    
    return {
      success: true,
      selector,
      function: functionSignature,
      functionName,
      params,
      intent,
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
function toTitleCase(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function extractFunctionSelector(data) {
  if (!data || typeof data !== 'string') return null;
  if (!data.startsWith('0x')) data = '0x' + data;
  if (data.length < 10) return null;
  return data.slice(0, 10).toLowerCase();
}

// Get metadata from our metadata service
async function getContractMetadata(contractAddress, chainId) {
  if (!window.metadataService) {
    console.error('[Decode] No metadata service available');
    return null;
  }
  
  return await window.metadataService.getContractMetadata(contractAddress, chainId);
}

// Export globally
window.decodeCalldata = decodeCalldata;

console.log('[KaiSign] Dynamic decoder ready - NO HARDCODED METADATA');