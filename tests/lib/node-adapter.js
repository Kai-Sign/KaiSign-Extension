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

// Export mock window for direct access if needed
// Note: SimpleInterface is available via mockWindow.SimpleInterface after loadDecoderModules()
// is called - it's loaded from the production decode.js file
export { mockWindow };
