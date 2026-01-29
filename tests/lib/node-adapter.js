/**
 * Node.js Adapter for KaiSign Browser-Based Decoders
 *
 * Adapts the browser-based decoder scripts (decode.js, recursive-decoder.js, etc.)
 * to run in a Node.js environment by providing a mock window object and
 * loading the decoder modules.
 */

import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create mock window object for browser-dependent code
const mockWindow = {
  ethers: ethers,

  // These will be populated when decoder modules are loaded
  decodeCalldata: null,
  formatTokenAmount: null,
  resolveJsonPath: null,
  RecursiveCalldataDecoder: null,
  recursiveCalldataDecoder: null,
  decodeCalldataRecursive: null,
  advancedTransactionDecoder: null,
  metadataService: null,
  getContractMetadata: null,
  getEIP712Metadata: null,
  clearMetadataCache: null,

  // Mock TextEncoder/TextDecoder (usually available in Node)
  TextEncoder: globalThis.TextEncoder,
  TextDecoder: globalThis.TextDecoder,

  // Mock console
  console: console,

  // Mock ethereum provider (will be set by tests if needed)
  ethereum: null,

  // Mock postMessage for background script communication
  postMessage: () => {},
  addEventListener: () => {},
  removeEventListener: () => {}
};

// Set global window
globalThis.window = mockWindow;

/**
 * Loads and adapts browser-based decoder modules for Node.js
 * @param {Object} metadataService - The metadata service to use
 * @returns {Object} - Object containing all decoder functions
 */
export async function loadDecoderModules(metadataService) {
  const extensionPath = path.resolve(__dirname, '../..');

  // Set metadata service before loading decoders
  mockWindow.metadataService = metadataService;
  mockWindow.getContractMetadata = (address, chainId, selector) =>
    metadataService.getContractMetadata(address, chainId, selector);
  mockWindow.getEIP712Metadata = (contract, primaryType) =>
    metadataService.getEIP712Metadata(contract, primaryType);

  // Load decode.js
  const decodeCode = fs.readFileSync(path.join(extensionPath, 'decode.js'), 'utf8');
  const adaptedDecodeCode = adaptBrowserCode(decodeCode, 'decode.js');
  eval(adaptedDecodeCode);

  // Load recursive-decoder.js
  const recursiveCode = fs.readFileSync(path.join(extensionPath, 'recursive-decoder.js'), 'utf8');
  const adaptedRecursiveCode = adaptBrowserCode(recursiveCode, 'recursive-decoder.js');
  eval(adaptedRecursiveCode);

  // Load advanced-decoder.js
  const advancedCode = fs.readFileSync(path.join(extensionPath, 'advanced-decoder.js'), 'utf8');
  const adaptedAdvancedCode = adaptBrowserCode(advancedCode, 'advanced-decoder.js');
  eval(adaptedAdvancedCode);

  // Return exposed functions from mockWindow
  return {
    decodeCalldata: mockWindow.decodeCalldata,
    formatTokenAmount: mockWindow.formatTokenAmount,
    resolveJsonPath: mockWindow.resolveJsonPath,
    RecursiveCalldataDecoder: mockWindow.RecursiveCalldataDecoder,
    recursiveCalldataDecoder: mockWindow.recursiveCalldataDecoder,
    decodeCalldataRecursive: mockWindow.decodeCalldataRecursive,
    advancedTransactionDecoder: mockWindow.advancedTransactionDecoder,
    calculateSelector: mockWindow.calculateSelector,
    SimpleInterface: mockWindow.SimpleInterface
  };
}

/**
 * Adapts browser code to work in Node.js
 * @param {string} code - Original browser code
 * @param {string} filename - Source filename for debugging
 * @returns {string} - Adapted code
 */
function adaptBrowserCode(code, filename) {
  let adapted = code;

  // Replace direct window references with globalThis.window
  // Be careful not to replace 'window' inside strings or variable names

  // These console.log statements are fine as-is since console is available in Node

  // The main adaptations needed:
  // 1. Ensure window is accessible (we set globalThis.window)
  // 2. Handle any browser-specific APIs that don't exist in Node

  // Wrap in try-catch for better error handling in Node context
  adapted = `
// Adapted from ${filename} for Node.js
try {
${adapted}
} catch (e) {
  console.error('[NodeAdapter] Error loading ${filename}:', e.message);
  throw e;
}
`;

  return adapted;
}

/**
 * Keccak256 implementation using ethers.js
 * @param {string} message - Message to hash
 * @returns {string} - Keccak256 hash
 */
export function keccak256(message) {
  return ethers.keccak256(ethers.toUtf8Bytes(message));
}

/**
 * Calculate function selector from signature
 * @param {string} signature - Function signature (e.g., "transfer(address,uint256)")
 * @returns {string} - 4-byte selector (e.g., "0xa9059cbb")
 */
export function calculateSelector(signature) {
  const hash = keccak256(signature);
  return hash.slice(0, 10);
}

/**
 * Simple ABI Interface class for Node.js
 * Mirrors the SimpleInterface class from decode.js
 */
export class SimpleInterface {
  constructor(abi) {
    this.abi = Array.isArray(abi) ? abi : [abi];
  }

  isDynamicType(type) {
    if (!type) return false;
    if (type === 'bytes' || type === 'string') return true;
    if (type.endsWith('[]')) return true;
    return false;
  }

  decodeStaticType(type, paramData, offset, input = null) {
    if (type === 'address') {
      const rawAddr = paramData.slice(offset + 24, offset + 64);
      return { value: '0x' + rawAddr.toLowerCase(), size: 64 };
    }

    if (type.startsWith('uint') || type.startsWith('int')) {
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

    if (type.startsWith('bytes') && !type.endsWith('[]') && type !== 'bytes') {
      const byteSize = parseInt(type.replace('bytes', '')) || 32;
      const hexSize = byteSize * 2;
      const value = '0x' + paramData.slice(offset, offset + hexSize);
      return { value, size: 64 };
    }

    if (type === 'bool') {
      const lastByte = paramData.slice(offset + 62, offset + 64);
      return { value: lastByte !== '00', size: 64 };
    }

    if (type === 'tuple' && input?.components) {
      const tupleData = {};
      let tupleOffset = 0;

      for (const component of input.components) {
        if (this.isDynamicType(component.type)) {
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

    return { value: '0x' + paramData.slice(offset, offset + 64), size: 64 };
  }

  decodeDynamicType(type, paramData, offset, input = null) {
    if (type === 'bytes') {
      const length = parseInt(paramData.slice(offset, offset + 64), 16);
      const hexLength = length * 2;
      const data = paramData.slice(offset + 64, offset + 64 + hexLength);
      return '0x' + data;
    }

    if (type === 'string') {
      const length = parseInt(paramData.slice(offset, offset + 64), 16);
      const hexLength = length * 2;
      const hexData = paramData.slice(offset + 64, offset + 64 + hexLength);
      return this.hexToString(hexData);
    }

    if (type.endsWith('[]')) {
      const baseType = type.slice(0, -2);
      const arrayLength = parseInt(paramData.slice(offset, offset + 64), 16);
      const results = [];

      if (this.isDynamicType(baseType)) {
        for (let i = 0; i < arrayLength; i++) {
          const elementOffsetHex = paramData.slice(offset + 64 + i * 64, offset + 64 + (i + 1) * 64);
          const elementOffset = parseInt(elementOffsetHex, 16) * 2;
          const value = this.decodeDynamicType(baseType, paramData, offset + 64 + elementOffset, input);
          results.push(value);
        }
      } else {
        let arrayOffset = offset + 64;
        for (let i = 0; i < arrayLength; i++) {
          const { value, size } = this.decodeStaticType(baseType, paramData, arrayOffset, input);
          results.push(value);
          arrayOffset += size;
        }
      }

      return results;
    }

    return '0x' + paramData.slice(offset, offset + 64);
  }

  hexToString(hex) {
    let str = '';
    for (let i = 0; i < hex.length; i += 2) {
      const charCode = parseInt(hex.slice(i, i + 2), 16);
      if (charCode === 0) break;
      str += String.fromCharCode(charCode);
    }
    return str;
  }

  decodeFunctionData(functionName, data) {
    const funcAbi = this.abi.find(item => item.name === functionName);
    if (!funcAbi) throw new Error(`Function ${functionName} not found`);

    const paramData = data.slice(10);
    const inputs = funcAbi.inputs || [];
    const results = [];

    let headOffset = 0;
    const dynamicParams = [];

    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];

      if (this.isDynamicType(input.type)) {
        const offsetHex = paramData.slice(headOffset, headOffset + 64);
        const tailOffset = parseInt(offsetHex, 16) * 2;
        dynamicParams.push({ index: i, input, tailOffset });
        headOffset += 64;
      } else {
        const { value, size } = this.decodeStaticType(input.type, paramData, headOffset, input);
        results[i] = value;
        headOffset += size;
      }
    }

    for (const { index, input, tailOffset } of dynamicParams) {
      const value = this.decodeDynamicType(input.type, paramData, tailOffset, input);
      results[index] = value;
    }

    return results;
  }
}

// Export mock window for direct access if needed
export { mockWindow };
