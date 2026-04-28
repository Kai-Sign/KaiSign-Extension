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
  removeEventListener: () => {},

  // Mock location for getDappName (used by EIP-712 decoder)
  location: { hostname: 'localhost' },

  // Debug flag
  KAISIGN_DEBUG: false
};

// Set global window
globalThis.window = mockWindow;

// Minimal document stub so runtime-registry.js can run
// (it checks document.readyState and registers listeners)
if (!globalThis.document) {
  globalThis.document = {
    readyState: 'complete',
    addEventListener: () => {},
    removeEventListener: () => {}
  };
}

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

  // Load runtime-registry.js (provides window.registryLoader with embedded ERC selectors)
  // Must load before decode.js so the unknown-function fallback can consult it
  const registryCode = fs.readFileSync(path.join(extensionPath, 'runtime-registry.js'), 'utf8');
  const adaptedRegistryCode = adaptBrowserCode(registryCode, 'runtime-registry.js');
  eval(adaptedRegistryCode);

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

  // Load eip712-decoder.js
  const eip712Code = fs.readFileSync(path.join(extensionPath, 'eip712-decoder.js'), 'utf8');
  const adaptedEIP712Code = adaptBrowserCode(eip712Code, 'eip712-decoder.js');
  eval(adaptedEIP712Code);

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
    SimpleInterface: mockWindow.SimpleInterface,
    formatTitleAddresses: mockWindow.formatTitleAddresses,
    // EIP-712 decoder functions
    getEIP712Metadata: mockWindow.getEIP712Metadata,
    formatEIP712Display: mockWindow.formatEIP712Display,
    getDappName: mockWindow.getDappName
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

/**
 * Load merkle-tree.js + onchain-verifier.js into the same node sandbox.
 *
 * These two files target the browser content-script world (localStorage,
 * window.kaisignMerkleTree slot, document.readyState init). This loader
 * stubs each so the classes can be exercised under node. Tests inject
 * fake RPC behavior by monkey-patching `verifier.rpcCall` /
 * `verifier.ethCallSepolia` after load — the merkle tree resolves the
 * verifier lazily so post-load injection works.
 *
 * Calling this multiple times in one process re-evaluates the modules.
 * The duplicate-load guards in each file (window.kaisignMerkleTree /
 * window.onChainVerifier checks) skip re-init if already loaded, so we
 * delete those slots first.
 *
 * @param {object} options
 * @param {boolean} options.withSeed - bootstrap merkle tree from merkle-seed.js
 * @returns {{verifier, tree, win, localStorage}}
 */
export function loadMerkleStack({ withSeed = false } = {}) {
  const extensionPath = path.resolve(__dirname, '../..');

  const localStorageStub = (() => {
    const store = new Map();
    return {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); },
      clear: () => { store.clear(); }
    };
  })();

  // Reset slots so re-loads don't hit the duplicate-load guards.
  delete mockWindow.kaisignMerkleTree;
  delete mockWindow.onChainVerifier;
  delete globalThis.keccak256Simple;

  if (withSeed) {
    const seedSrc = fs.readFileSync(path.join(extensionPath, 'merkle-seed.js'), 'utf8');
    const m = seedSrc.match(/window\.__KAISIGN_MERKLE_SEED\s*=\s*(\{[\s\S]*?\})\s*;?\s*$/);
    if (!m) throw new Error('Failed to parse merkle-seed.js');
    mockWindow.__KAISIGN_MERKLE_SEED = JSON.parse(m[1]);
  } else {
    delete mockWindow.__KAISIGN_MERKLE_SEED;
  }

  globalThis.localStorage = localStorageStub;
  globalThis.document = globalThis.document
    || { readyState: 'complete', addEventListener: () => {} };

  // decode.js / onchain-verifier.js / merkle-tree.js reference
  // `keccak256Simple` as a free identifier. In decode.js the function is
  // declared *inside* an `if (window.SimpleInterface) { ... } else { ... }`
  // duplicate-load guard, so even indirect eval cannot hoist it to global
  // scope. Provide a thin shim backed by ethers — semantically identical
  // (decode.js's own first branch delegates to ethers.keccak256 anyway).
  globalThis.keccak256Simple = (message) => ethers.keccak256(ethers.toUtf8Bytes(message));

  const indirectEval = (0, eval);

  if (!mockWindow.SimpleInterface) {
    const decodeCode = fs.readFileSync(path.join(extensionPath, 'decode.js'), 'utf8');
    indirectEval(decodeCode);
  }

  const verifierCode = fs.readFileSync(path.join(extensionPath, 'onchain-verifier.js'), 'utf8');
  indirectEval(verifierCode);

  const merkleCode = fs.readFileSync(path.join(extensionPath, 'merkle-tree.js'), 'utf8');
  indirectEval(merkleCode);

  return {
    verifier: mockWindow.onChainVerifier,
    tree: mockWindow.kaisignMerkleTree,
    win: mockWindow,
    localStorage: localStorageStub
  };
}
