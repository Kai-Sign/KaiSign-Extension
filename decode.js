/**
 * decode.js - Pure ABI Calldata Decoder (SimpleInterface)
 *
 * Purpose
 *   Decodes EVM calldata into typed parameter values and renders human
 *   intent strings using ERC-7730 metadata. Pure compute: no network, no
 *   storage writes, no remote code execution. Loaded into the page's MAIN
 *   world by the extension manifest.
 *
 * Trust boundary
 *   Inputs (calldata bytes, ERC-7730 metadata blob, chainId) are all treated
 *   as untrusted data. Calldata may be malformed or truncated; metadata may
 *   mis-tag fields. This file must never throw on adversarial input - it
 *   degrades gracefully (zero-padding, raw-hex fallback) and surfaces what
 *   it could decode.
 *
 * Security-critical invariants
 *   - safeSlice (line 255) zero-pads truncated calldata rather than throwing.
 *     Removing this breaks LiFi minimal fixtures and any short-call edge case.
 *   - formatTokenAmount (line 1177) treats values within 1000 of MAX_UINT256
 *     (line 1198) as the "unlimited" sentinel - never as a literal 78-digit
 *     number. This is what stops Approve titles from showing wei garbage.
 *   - Token-formatted values exceeding ~2^200 (and not MAX_UINT256) fall back
 *     to raw hex display. Defends against backend metadata that incorrectly
 *     marks a packed bitfield (e.g. 1inch v6 partnerAndFee) as a token amount.
 *   - parseArrayType (line 277) rejects malformed Solidity array type strings.
 *   - keccak256 hashing is delegated to ethers.js (window.ethers) and must
 *     remain pure - no metadata-derived data ever influences the hash function.
 *
 * Trust dependencies
 *   - window.ethers - loaded by manifest, treated as trusted runtime.
 *   - window.metadataService / window.getContractMetadata - the verification
 *     gate lives in subgraph-metadata.js; this file consumes the result but
 *     does not re-verify.
 *   - window.registryLoader - read-only ERC-standard selector cache, used as
 *     last-resort fallback when metadata + ABI lookup both fail.
 *
 * Out of scope
 *   - On-chain verification (lives in onchain-verifier.js).
 *   - Network fetching (lives in subgraph-metadata.js, gated by background.js
 *     RPC host whitelist).
 */

// Guard against duplicate loading (MAIN world scripts can run multiple times)
if (window.SimpleInterface) {
  console.log('[decode.js] Already loaded, skipping');
} else {

console.log('[decode.js] VERSION 2.1 LOADED - formatTokenAmount FIXED');
function getKaiSignDebugFlag() {
  try {
    return typeof window !== 'undefined' && window.localStorage?.getItem('kaisign_dev_mode') === 'true';
  } catch {
    return false;
  }
}

const KAISIGN_DEBUG = getKaiSignDebugFlag();

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

function shortenHex(value, prefix = 8, suffix = 6) {
  if (!value || value.length <= prefix + suffix) return value || '';
  return `${value.slice(0, prefix)}...${value.slice(-suffix)}`;
}

function extractCalldataWords(data) {
  if (!data || !data.startsWith('0x') || data.length < 10) return [];
  const payload = data.slice(10);
  const words = [];
  for (let i = 0; i + 64 <= payload.length; i += 64) {
    words.push(payload.slice(i, i + 64).toLowerCase());
  }
  return words;
}

function extractAddressCandidates(words) {
  const candidates = [];
  const seen = new Set();

  for (const word of words) {
    if (!/^[0-9a-f]{64}$/.test(word)) continue;
    if (!/^0{24}/.test(word)) continue;

    const address = `0x${word.slice(24)}`;
    if (address === '0x0000000000000000000000000000000000000000') continue;
    if (seen.has(address)) continue;

    seen.add(address);
    candidates.push(address);
  }

  return candidates;
}

function extractTimestampCandidates(words) {
  const timestamps = [];
  const seen = new Set();

  for (const word of words) {
    try {
      const value = BigInt(`0x${word}`);
      if (value < 1700000000n || value > 2200000000n) continue;

      const numeric = Number(value);
      if (seen.has(numeric)) continue;
      seen.add(numeric);
      timestamps.push(numeric);
    } catch {
      // Ignore invalid words.
    }
  }

  return timestamps.sort((a, b) => a - b);
}

async function resolveUnknownSummaryAddressLabels(addresses, chainId) {
  const labels = [];
  const tokenHints = [];

  for (const address of addresses) {
    let label = shortenHex(address);

    try {
      const tokenInfo = await window.metadataService?.getTokenMetadata?.(address, chainId);
      if (tokenInfo?.symbol && tokenInfo.symbol !== 'UNKNOWN') {
        tokenHints.push(tokenInfo.symbol);
        label = `${tokenInfo.symbol} (${shortenHex(address)})`;
      }
    } catch {
      // Keep the shortened address fallback.
    }

    labels.push(label);
  }

  return {
    labels,
    tokenHints: [...new Set(tokenHints)]
  };
}

async function buildUnknownCalldataSummary(data, chainId, baseTitle = '') {
  const selector = data?.slice(0, 10) || '0x';
  const selectorInfo = window.registryLoader?.getSelectorInfo?.(selector);
  const words = extractCalldataWords(data);
  const addresses = extractAddressCandidates(words);
  const timestamps = extractTimestampCandidates(words);
  const { labels: addressLabels, tokenHints } = await resolveUnknownSummaryAddressLabels(addresses.slice(0, 4), chainId);

  const title = baseTitle || (selectorInfo?.intent
    ? `${selectorInfo.intent} on unknown contract`
    : `Unknown call ${selector}`);

  const lines = [
    `Selector: ${selector}`
  ];

  if (selectorInfo?.signature) {
    lines.push(`Known selector: ${selectorInfo.signature}`);
  }
  if (addressLabels.length) {
    lines.push(`Address refs: ${addressLabels.join(', ')}`);
  }
  if (timestamps.length) {
    const formattedTimes = timestamps.slice(0, 2).map(value => {
      try {
        return new Date(value * 1000).toISOString().replace('.000Z', 'Z');
      } catch {
        return String(value);
      }
    });
    lines.push(`Time bounds: ${formattedTimes.join(', ')}`);
  }
  lines.push(`Calldata size: ${Math.max(0, (data.length - 2) / 2)} bytes`);

  return {
    title,
    selector,
    selectorName: selectorInfo?.name || null,
    selectorSignature: selectorInfo?.signature || null,
    calldataBytes: Math.max(0, (data.length - 2) / 2),
    preview: `${data.slice(0, 18)}...${data.slice(-16)}`,
    addresses,
    addressLabels,
    addressCount: addresses.length,
    tokenHints,
    timestamps,
    lines
  };
}

// Enhanced ABI decoder - supports all Solidity types including bytes, bytes[], arrays
// NO HARDCODED SELECTORS - all type handling is generic
class SimpleInterface {
  constructor(abi) {
    this.abi = Array.isArray(abi) ? abi : [abi];
  }

  /**
   * Safe slice with bounds checking
   * Throws if start is beyond data length; zero-pads if end exceeds data length
   * @param {string} data - Hex string without 0x prefix
   * @param {number} start - Start offset in hex chars
   * @param {number} end - End offset in hex chars
   * @returns {string} - Sliced hex string, zero-padded if needed
   */
  safeSlice(data, start, end) {
    const needed = end - start;
    if (start > data.length * 2) {
      // Corrupt offset — pointer is absurdly large (> 2x data), indicates bad data
      throw new Error(`ABI decode: offset ${start / 2} beyond data length ${data.length / 2}`);
    }
    if (start >= data.length) {
      // Past end of data — zero-pad entire result (truncated calldata)
      return '0'.repeat(needed);
    }
    const slice = data.slice(start, end);
    if (slice.length < needed) {
      return slice + '0'.repeat(needed - slice.length);
    }
    return slice;
  }

  /**
   * Parse array type into base type and optional fixed size
   * @param {string} type - Solidity type (e.g., 'uint256[3]', 'address[]', 'bytes32[2][]')
   * @returns {{baseType: string, size: number|null}|null} - null if not an array type
   */
  parseArrayType(type) {
    const match = type.match(/^(.+)\[(\d*)\]$/);
    if (!match) return null;
    return { baseType: match[1], size: match[2] === '' ? null : parseInt(match[2]) };
  }

  /**
   * Check if a type is dynamic (requires offset resolution)
   * @param {string} type - Solidity type
   * @param {object} input - ABI input definition (for checking tuple components)
   * @returns {boolean}
   */
  isDynamicType(type, input = null) {
    if (!type) return false;
    // bytes, string are always dynamic
    if (type === 'bytes' || type === 'string') return true;
    // Array types: T[] is always dynamic, T[N] is dynamic only if T is dynamic
    const arr = this.parseArrayType(type);
    if (arr) {
      if (arr.size === null) return true; // T[] — dynamic (has length prefix)
      return this.isDynamicType(arr.baseType, input); // T[N] — static if T is static
    }
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
    // Fixed-size arrays MUST be checked first, before scalar type checks
    // (e.g., uint256[5] starts with 'uint' but is an array, not a scalar)
    const fixedArr = this.parseArrayType(type);
    if (fixedArr && fixedArr.size !== null && !this.isDynamicType(fixedArr.baseType, input)) {
      const results = [];
      let arrOffset = 0;
      for (let i = 0; i < fixedArr.size; i++) {
        const { value, size } = this.decodeStaticType(fixedArr.baseType, paramData, offset + arrOffset, input);
        results.push(value);
        arrOffset += size;
      }
      return { value: results, size: arrOffset };
    }

    // Address: 20 bytes right-padded in 32 bytes
    if (type === 'address') {
      const rawAddr = this.safeSlice(paramData, offset + 24, offset + 64);
      return {
        value: '0x' + rawAddr.toLowerCase(),
        size: 64
      };
    }

    // Unsigned integers: uint8, uint16, ..., uint256
    if (type.startsWith('uint')) {
      const hexValue = this.safeSlice(paramData, offset, offset + 64);
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

    // Signed integers: int8, int16, ..., int256 (two's complement)
    if (type.startsWith('int')) {
      const hexValue = this.safeSlice(paramData, offset, offset + 64);
      try {
        const raw = BigInt('0x' + hexValue);
        const bits = parseInt(type.slice(3)) || 256;

        // For int types < 256 bits, the ABI encoding sign-extends to 256 bits
        // Extract only the lower N bits and apply two's complement
        const mask = (1n << BigInt(bits)) - 1n;
        const truncated = raw & mask;
        const halfRange = 1n << BigInt(bits - 1);
        const value = truncated >= halfRange ? truncated - (1n << BigInt(bits)) : truncated;

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
      const value = '0x' + this.safeSlice(paramData, offset, offset + hexSize);
      return { value, size: 64 }; // Always takes 32 bytes in ABI encoding
    }

    // Boolean
    if (type === 'bool') {
      const lastByte = this.safeSlice(paramData, offset + 62, offset + 64);
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
      const length = parseInt(this.safeSlice(paramData, offset, offset + 64), 16);
      const hexLength = length * 2;
      const data = paramData.slice(offset + 64, offset + 64 + hexLength);
      return '0x' + data;
    }

    // Dynamic string
    if (type === 'string') {
      const length = parseInt(this.safeSlice(paramData, offset, offset + 64), 16);
      const hexLength = length * 2;
      const hexData = paramData.slice(offset + 64, offset + 64 + hexLength);
      return this.hexToString(hexData);
    }

    // Fixed-size arrays of dynamic types: T[N] where T is dynamic (no length prefix)
    const dynArr = this.parseArrayType(type);
    if (dynArr && dynArr.size !== null) {
      const results = [];
      // T[N] with dynamic T: each element has an offset pointer (no length prefix)
      for (let i = 0; i < dynArr.size; i++) {
        const elementOffsetHex = this.safeSlice(paramData, offset + i * 64, offset + (i + 1) * 64);
        const elementOffset = parseInt(elementOffsetHex, 16) * 2;
        const value = this.decodeDynamicType(dynArr.baseType, paramData, offset + elementOffset, input);
        results.push(value);
      }
      return results;
    }

    // Dynamic-size array types: T[] (address[], uint256[], bytes[], etc.)
    if (dynArr && dynArr.size === null) {
      const baseType = dynArr.baseType;
      const arrayLength = parseInt(this.safeSlice(paramData, offset, offset + 64), 16);
      const results = [];

      if (this.isDynamicType(baseType, input)) {
        // Array of dynamic elements (e.g., bytes[], string[], tuple[] with dynamic components)
        // Each element has an offset pointer
        for (let i = 0; i < arrayLength; i++) {
          const elementOffsetHex = this.safeSlice(paramData, offset + 64 + i * 64, offset + 64 + (i + 1) * 64);
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
          const relOffsetHex = this.safeSlice(paramData, offset + tupleOffset, offset + tupleOffset + 64);
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
    return '0x' + this.safeSlice(paramData, offset, offset + 64);
  }

  /**
   * Convert hex string to UTF-8 string
   * @param {string} hex - Hex string without 0x prefix
   * @returns {string}
   */
  hexToString(hex) {
    if (!hex || hex.length === 0) return '';
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    }
    // Strip trailing null bytes
    let end = bytes.length;
    while (end > 0 && bytes[end - 1] === 0) end--;
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, end));
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
        const offsetHex = this.safeSlice(paramData, headOffset, headOffset + 64);
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
    KAISIGN_DEBUG && console.log('[Decode] decodeCalldata called:', { contractAddress, chainId, selector, dataLength: data.length });

    // Pass selector to metadata lookup for proxy detection (e.g., Safe proxies)
    let metadata = await getContractMetadata(contractAddress, chainId, selector);
    KAISIGN_DEBUG && console.log('[Decode] Metadata fetch result:', metadata ? 'FOUND' : 'NOT FOUND', metadata);

    // If no metadata from subgraph, return failure
    if (!metadata) {
      KAISIGN_DEBUG && console.log('[Decode] No metadata found, returning Contract interaction');
      const unknownSummary = await buildUnknownCalldataSummary(data, chainId);
      return {
        success: false,
        selector,
        intent: unknownSummary.title,
        unknownSummary,
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
          KAISIGN_DEBUG && console.log('[Decode] Checking function:', signature, 'selector:', expectedSelector, 'vs', selector);

          if (expectedSelector === selector) {
            functionSignature = signature;
            functionName = item.name;
            abiFunction = item;
            KAISIGN_DEBUG && console.log('[Decode] ✅ MATCHED function:', signature);
            break;
          }
        }
      }
    } else if (typeof metadata.context?.contract?.abi === 'string' && metadata.context?.contract?.selectorFallbacks) {
      functionName = metadata.context.contract.selectorFallbacks[selector];
      if (functionName) functionSignature = `${functionName}(...)`;
    }
    
    if (!functionSignature && !functionName) {
      const contractName = metadata.context?.contract?.name || '';
      KAISIGN_DEBUG && console.log('[Decode] Function not found in metadata ABI:', { selector, contractName, abiLength: metadata.context?.contract?.abi?.length });
      // Try the runtime selector registry for a human signature even when metadata's ABI is missing the function
      const selectorIntent = window.registryLoader?.getSelectorInfo?.(selector)?.intent;
      const fallbackTitle = contractName
        ? (selectorIntent ? `${selectorIntent} on ${contractName}` : `Unknown function on ${contractName}`)
        : (selectorIntent ? `${selectorIntent} (${selector})` : `Unknown call ${selector}`);
      const unknownSummary = await buildUnknownCalldataSummary(data, chainId, fallbackTitle);
      return {
        success: false,
        selector,
        contractName,
        metadata,
        intent: unknownSummary.title,
        unknownSummary,
        error: 'Function not found in metadata ABI'
      };
    }
    
    // Get intent from metadata
    let intent = 'Contract interaction';
    let fieldInfo = {};

    let format = metadata.display?.formats?.[functionSignature] || metadata.display?.formats?.[functionName];

    // Fallback: when ABI uses simplified types (e.g. "tuple") but format keys use expanded
    // tuple types (e.g. "(bytes32,string,address,...)"), match by function name prefix
    if (!format && functionName && metadata.display?.formats) {
      const prefix = functionName + '(';
      for (const key of Object.keys(metadata.display.formats)) {
        if (key.startsWith(prefix)) {
          format = metadata.display.formats[key];
          break;
        }
      }
      if (!format) {
        KAISIGN_DEBUG && console.warn(`[Decode] No format found for function ${functionName} (signature ${functionSignature})`);
      }
    }

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
          // Prefer _value over _hex - _value is correct for signed integers (two's complement)
          rawValue = value._value !== undefined ? value._value : (value._hex ? BigInt(value._hex).toString() : String(value));
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
            KAISIGN_DEBUG && console.log(`[Decode] Detected max uint256, displaying as: "${displayValue}"`);
          } else {
            // Format with decimals
            const decimals = fieldDef.params.decimals;
            const symbol = fieldDef.params.symbol || '';
            KAISIGN_DEBUG && console.log(`[Decode] Formatting ${paramName}: rawValue="${rawValue}" (type: ${typeof rawValue}), decimals=${decimals} (type: ${typeof decimals}), symbol=${symbol}`);
            try {
              const dec = Number(decimals);
              const value = BigInt(rawValue);
              const divisor = BigInt(10) ** BigInt(dec);
              const integerPart = value / divisor;
              const fractionalPart = value % divisor;
              if (value === 0n) {
                displayValue = symbol ? `0 ${symbol}` : '0';
                KAISIGN_DEBUG && console.log(`[Decode] INLINE formatted: "${displayValue}"`);
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
              KAISIGN_DEBUG && console.log(`[Decode] INLINE formatted: "${displayValue}"`);
            } catch (e) {
              console.error('[Decode] Inline format error:', e);
              displayValue = rawValue;
            }
          }
        } else if (fieldDef?.format === 'tokenAmount' && fieldDef.params?.tokenPath) {
          // Dynamic token lookup - resolve decimals/symbol from token address in another param
          // Support ERC-7730 paths like "_route.[0]" via resolveFieldPath
          let tokenAddress = rawParams[fieldDef.params.tokenPath];
          if (tokenAddress === undefined) {
            tokenAddress = resolveFieldPath(fieldDef.params.tokenPath, rawParams);
          }
          if (tokenAddress && typeof tokenAddress === 'string' && tokenAddress.length >= 10) {
            try {
              const normalizedAddr = tokenAddress.toLowerCase();
              const nativeCurrency = fieldDef.params.nativeCurrencyAddress;
              const isNative = normalizedAddr === '0x0000000000000000000000000000000000000000' ||
                normalizedAddr === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' ||
                (nativeCurrency && normalizedAddr === nativeCurrency.toLowerCase());
              
              if (isNative) {
                // Native ETH - we know decimals and symbol
                displayValue = formatTokenAmount(rawValue, 18, 'ETH');
              } else if (window.metadataService) {
                const tokenInfo = await window.metadataService.getTokenMetadata(tokenAddress, chainId);
                const decimals = tokenInfo.decimals;
                const symbol = tokenInfo.symbol || '';
                
                // Only format if we have decimals from metadata
                if (decimals !== undefined && decimals !== null) {
                  displayValue = formatTokenAmount(rawValue, decimals, symbol);
                } else {
                  // No decimals from metadata, keep raw value
                  displayValue = rawValue;
                }
              } else {
                // No metadata service available, keep raw value
                displayValue = rawValue;
              }
            } catch (e) {
              console.warn('[Decode] tokenAmount format error:', e.message);
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

      // ERC-7730: Process fields with sub-paths (e.g., "_route.[0]", "order.token")
      // These reference specific elements within decoded arrays/tuples
      for (const [fieldPath, fieldDef] of Object.entries(fieldInfo)) {
        // Skip if already handled as a top-level param or if it's a calldata field
        if (rawParams[fieldPath] !== undefined || fieldDef.format === 'calldata') continue;

        // Try to resolve the sub-path value from decoded params
        const resolvedValue = resolveFieldPath(fieldPath, rawParams);
        if (resolvedValue === undefined) continue;

        let rawValue;
        if (resolvedValue && typeof resolvedValue === 'object' && '_isBigNumber' in resolvedValue) {
          rawValue = resolvedValue._value !== undefined ? resolvedValue._value : String(resolvedValue);
        } else {
          rawValue = String(resolvedValue || '');
        }

        let displayValue = rawValue;

        // Apply tokenAmount formatting for sub-path fields
        if (fieldDef.format === 'tokenAmount' && fieldDef.params?.tokenPath) {
          let tokenAddress = rawParams[fieldDef.params.tokenPath];
          if (tokenAddress === undefined) {
            tokenAddress = resolveFieldPath(fieldDef.params.tokenPath, rawParams);
          }
          if (tokenAddress && typeof tokenAddress === 'string' && tokenAddress.length >= 10) {
            try {
              const normalizedAddr = tokenAddress.toLowerCase();
              const nativeCurrency = fieldDef.params.nativeCurrencyAddress;
              const isNative = normalizedAddr === '0x0000000000000000000000000000000000000000' ||
                normalizedAddr === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' ||
                (nativeCurrency && normalizedAddr === nativeCurrency.toLowerCase());
              
              if (isNative) {
                // Native ETH - we know decimals and symbol
                displayValue = formatTokenAmount(rawValue, 18, 'ETH');
              } else if (typeof window !== 'undefined' && window.metadataService) {
                const tokenInfo = await window.metadataService.getTokenMetadata(tokenAddress, chainId);
                const decimals = tokenInfo.decimals;
                const symbol = tokenInfo.symbol || '';
                
                // Only format if we have decimals from metadata
                if (decimals !== undefined && decimals !== null) {
                  displayValue = formatTokenAmount(rawValue, decimals, symbol);
                } else {
                  // No decimals from metadata, keep raw value
                  displayValue = rawValue;
                }
              } else {
                // No metadata service available, keep raw value
                displayValue = rawValue;
              }
            } catch (e) {
              // Fall through to raw display
              displayValue = rawValue;
            }
          }
        } else if (fieldDef.format === 'addressName' || fieldDef.format === 'addressOrName') {
          try {
            displayValue = await applyFieldFormat(rawValue, fieldDef, rawParams, chainId);
          } catch (e) {
            displayValue = rawValue;
          }
        }

        // Use the field path as key (avoiding conflicts with ABI param names)
        const formattedKey = fieldPath.replace(/\.\[/g, '[').replace(/\]/g, ']');
        params[formattedKey] = rawValue;
        formatted[formattedKey] = {
          label: fieldDef.label || formattedKey,
          value: displayValue,
          rawValue: rawValue,
          format: fieldDef.format || 'raw',
          params: fieldDef.params || {}
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

      KAISIGN_DEBUG && console.log('[Decode] Composite intent - rawParams:', {
        keys: Object.keys(rawParams),
        sourceParam: sourceParam,
        commandsValue: commandsValue,
        commandsType: typeof commandsValue,
        inputsValue: inputsValue,
        inputsType: typeof inputsValue,
        inputsIsArray: Array.isArray(inputsValue),
        inputsLength: Array.isArray(inputsValue) ? inputsValue.length : 'N/A'
      });

      if (commandsValue && registry) {
        // Decode commands using the registry
        decodedCommands = await decodeCommandArray(commandsValue, inputsValue, registry, chainId);
        finalIntent = buildCompositeIntent(intentConfig, decodedCommands);
        KAISIGN_DEBUG && console.log('[Decode] Built composite intent:', finalIntent);
      } else {
        finalIntent = 'Execute commands';
        KAISIGN_DEBUG && console.log('[Decode] Missing commands or registry for composite intent');
      }
    } else if (intent && typeof intent === 'object' && intent.type === 'interpolated') {
      // ERC-7730 interpolatedIntent - process template with field values
      const template = intent.template;
      KAISIGN_DEBUG && console.log('[Decode] Processing interpolatedIntent template:', template);
      // Pass format.fields so we can apply formatters to nested paths (async for API token lookups)
      finalIntent = await substituteInterpolatedIntent(template, rawParams, format.fields || [], chainId);
      KAISIGN_DEBUG && console.log('[Decode] Interpolated result:', finalIntent);
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
          // Check if this is an array path like "#._swapData.[].callData"
          const isArrayPath = fieldPath.includes('.[].');

          if (isArrayPath) {
            // Handle array iteration for paths like "#._swapData.[].callData"
            // Extract the array base path and the field within each element
            const arrayPathMatch = fieldPath.match(/^(#\.|@\.)?(.+?)\.\[\]\.(.+)$/);
            if (arrayPathMatch) {
              const arrayName = arrayPathMatch[2]; // e.g., "_swapData"
              const elementField = arrayPathMatch[3]; // e.g., "callData"
              const array = rawParams[arrayName];

              if (Array.isArray(array)) {
                for (let i = 0; i < array.length; i++) {
                  const element = array[i];
                  const calldataValue = element[elementField];

                  if (typeof calldataValue === 'string' && calldataValue.startsWith('0x') && calldataValue.length > 10) {
                    // Resolve target from the same array element
                    let target = fieldDef.calldataTarget;
                    if (typeof target === 'string') {
                      // For array targets like "#._swapData.[].callTo", get from same element
                      const targetMatch = target.match(/^(#\.|@\.)?(.+?)\.\[\]\.(.+)$/);
                      if (targetMatch && targetMatch[2] === arrayName) {
                        // Same array, get field from current element
                        target = element[targetMatch[3]];
                      } else if (target.startsWith('$.') || target.startsWith('#.')) {
                        target = resolveFieldPath(target, rawParams);
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
          } else {
            // Original single-value path handling
            let calldataValue = rawParams[fieldPath];
            // Also try resolving with path resolution for #. prefixed paths
            if (calldataValue === undefined && (fieldPath.startsWith('#.') || fieldPath.startsWith('@.'))) {
              calldataValue = resolveFieldPath(fieldPath, rawParams);
            }

            if (typeof calldataValue === 'string' && calldataValue.startsWith('0x') && calldataValue.length > 10) {
              let target = fieldDef.calldataTarget;
              if (typeof target === 'string') {
                if (target.startsWith('$.') || target.startsWith('#.')) {
                  target = resolveFieldPath(target, rawParams);
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
      metadata,
      decodedCommands, // Include decoded commands for display
      nestedIntents,
      aggregatedIntent
    };
    
  } catch (error) {
    console.error('[Decode] Error:', error.message);
    const unknownSummary = await buildUnknownCalldataSummary(data, chainId);
    return {
      success: false,
      selector: data.slice(0, 10),
      intent: unknownSummary.title,
      unknownSummary,
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
  KAISIGN_DEBUG && console.log('[formatTokenAmount] CALLED with:', { rawValue, decimals, symbol, rawValueType: typeof rawValue, decimalsType: typeof decimals });
  try {
    // Ensure decimals is a number
    const dec = Number(decimals);
    KAISIGN_DEBUG && console.log('[formatTokenAmount] dec after Number():', dec);
    if (isNaN(dec) || dec < 0) {
      console.warn('[formatTokenAmount] Invalid decimals:', decimals);
      return rawValue;
    }

    // Handle empty or invalid hex values
    if (!rawValue || rawValue === '0x' || rawValue === '0x0') {
      return symbol ? `0 ${symbol}` : '0';
    }

    const value = BigInt(rawValue);
    KAISIGN_DEBUG && console.log('[formatTokenAmount] value as BigInt:', value.toString());

    // Sentinel: uint256.max (and shave-off-a-few variants) means "unlimited" / "all"
    // canonical for ERC-20 approve(spender, MAX) and aave withdraw(MAX) etc.
    const MAX_UINT256 = (1n << 256n) - 1n;
    if (value > MAX_UINT256 - 1000n) {
      return symbol ? `unlimited ${symbol}` : 'unlimited';
    }

    // Defensive cap: anything above 2^200 cannot be a real token amount and is almost
    // certainly a mis-tagged packed bitfield (e.g. 1inch v6 partnerAndFee). Refuse to
    // pretty-print as a token amount; show raw hex so the user notices.
    if (value > (1n << 200n)) {
      console.warn('[formatTokenAmount] value exceeds 2^200, refusing to format as token amount:', value.toString());
      return `0x${value.toString(16)}`;
    }

    const divisor = BigInt(10) ** BigInt(dec);
    KAISIGN_DEBUG && console.log('[formatTokenAmount] divisor:', divisor.toString());
    const integerPart = value / divisor;
    const fractionalPart = value % divisor;
    if (value === 0n) {
      return symbol ? `0 ${symbol}` : '0';
    }
    KAISIGN_DEBUG && console.log('[formatTokenAmount] integerPart:', integerPart.toString(), 'fractionalPart:', fractionalPart.toString());

    // Format fractional part with leading zeros (full precision)
    const fullFraction = fractionalPart.toString().padStart(dec, '0');
    KAISIGN_DEBUG && console.log('[formatTokenAmount] fractionalStr after padStart:', fullFraction);

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

    KAISIGN_DEBUG && console.log('[formatTokenAmount] fractionalStr final:', fractionalStr);

    const formatted = `${integerPart}.${fractionalStr}`;
    const result = symbol ? `${formatted} ${symbol}` : formatted;
    KAISIGN_DEBUG && console.log('[formatTokenAmount] RESULT:', result);
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
  KAISIGN_DEBUG && console.log('[decodeCommandArray] Called with:', {
    commands: commands,
    commandsType: typeof commands,
    inputs: inputs,
    inputsType: typeof inputs,
    inputsIsArray: Array.isArray(inputs),
    inputsLength: Array.isArray(inputs) ? inputs.length : 'N/A',
    registryKeys: Object.keys(registry || {})
  });

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

    KAISIGN_DEBUG && console.log(`[decodeCommandArray] Command ${i/2}: ${cmdByte}`, {
      cmdName: cmdDef?.name,
      inputData: inputData,
      inputDataType: typeof inputData,
      inputDataLength: inputData ? inputData.length : 'N/A'
    });

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

            // Handle BigNumber-like objects - prefer _value over _hex for signed integers
            if (value && typeof value === 'object' && '_isBigNumber' in value) {
              value = value._value !== undefined ? value._value : (value._hex ? BigInt(value._hex).toString() : String(value));
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

          // Debug: Log decoded parameters
          KAISIGN_DEBUG && console.log(`[DecodeCommand] ${cmdDef.name} (${cmdByte}) decoded params:`, {
            paramNames: Object.keys(decodedParams),
            path: decodedParams.path,
            pathType: typeof decodedParams.path,
            pathIsArray: Array.isArray(decodedParams.path),
            pathLength: Array.isArray(decodedParams.path) ? decodedParams.path.length : (typeof decodedParams.path === 'string' ? decodedParams.path.length : 'N/A'),
            amountIn: decodedParams.amountIn,
            amountOutMin: decodedParams.amountOutMin,
            amountMin: decodedParams.amountMin
          });

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

              // Skip if value is already formatted (contains letters or token symbols)
              if (typeof rawVal === 'string' && /[a-zA-Z]/.test(rawVal)) {
                KAISIGN_DEBUG && console.log('[DecodeCommand] Skipping already-formatted param:', paramDef.name, '=', rawVal);
                continue;
              }

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
            KAISIGN_DEBUG && console.log('[DecodeCommand] Substituting intent template:', {
              template: cmdDef.intent,
              decodedParams: decodedParams,
              paramKeys: Object.keys(decodedParams)
            });
            intent = substituteCommandIntent(cmdDef.intent || cmdDef.name, decodedParams);
            KAISIGN_DEBUG && console.log('[DecodeCommand] Substituted intent:', intent);
          }
        } catch (e) {
          KAISIGN_DEBUG && console.log('[decodeCommandArray] Failed to decode input for command', cmdByte, e.message);
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
      // Format as string for display - prefer _value over _hex for signed integers
      if (typeof rawObjValue === 'object' && '_isBigNumber' in rawObjValue) {
        return rawObjValue._value !== undefined ? rawObjValue._value : (rawObjValue._hex ? BigInt(rawObjValue._hex).toString() : String(rawObjValue));
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

  KAISIGN_DEBUG && console.log('[interpolatedIntent] Template:', template);
  KAISIGN_DEBUG && console.log('[interpolatedIntent] Fields:', fields);

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
    KAISIGN_DEBUG && console.log(`[interpolatedIntent] Processing ${fullMatch}, pathStr="${pathStr}"`);

    // Find field spec for this path
    const fieldSpec = fields.find(f => f.path === pathStr);
    if (!fieldSpec) {
      KAISIGN_DEBUG && console.warn(`[interpolatedIntent] No field spec found for path: ${pathStr}`);
      return { match: fullMatch, value: fullMatch };
    }

    KAISIGN_DEBUG && console.log('[interpolatedIntent] Found field spec:', fieldSpec);

    // Navigate to the value using the path
    const value = resolveFieldPath(pathStr, rawParams);
    if (value === undefined || value === null) {
      KAISIGN_DEBUG && console.warn(`[interpolatedIntent] No value found for path: ${pathStr}`);
      return { match: fullMatch, value: fullMatch };
    }

    KAISIGN_DEBUG && console.log('[interpolatedIntent] Resolved value:', value);

    // Apply the field's format and params (ERC-7730 requirement) - async for token lookups
    const formatted = await applyFieldFormat(value, fieldSpec, rawParams, chainId);
    KAISIGN_DEBUG && console.log('[interpolatedIntent] Formatted value:', formatted);

    return { match: fullMatch, value: formatted };
  }));

  // Apply all replacements with duplicate symbol detection
  let result = template;
  for (const { match, value } of replacements) {
    let finalValue = String(value);

    // Check if template has a token symbol immediately after this placeholder
    // e.g., "Sell {sellAmount} ETH" with value "0.003 ETH" → avoid "0.003 ETH ETH"
    const matchIndex = result.indexOf(match);
    if (matchIndex !== -1) {
      const afterMatch = result.slice(matchIndex + match.length);
      const symbolMatch = afterMatch.match(/^\s+(USDC|USDT|DAI|WETH|ETH|WBTC|MATIC|BNB|AVAX|FTM|ARB|OP|[A-Z]{2,6})\b/i);
      if (symbolMatch && finalValue.toUpperCase().endsWith(symbolMatch[1].toUpperCase())) {
        // Remove the duplicate symbol from the end of the value
        const originalValue = finalValue;
        finalValue = finalValue.replace(new RegExp(`\\s*${symbolMatch[1]}$`, 'i'), '');
        // If stripping leaves an empty value, keep the original
        if (finalValue.trim() === '') {
          finalValue = originalValue;
        }
      }
    }

    result = result.replace(match, finalValue);
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
    // Handle array index: path.[0] or path.[-1] - FIXED: support negative indices
    const arrayMatch = part.match(/^(.+?)?\[(-?\d+)\]$/);

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
        // FIXED: Handle negative indices for arrays (path.[-1] → last element)
        const idx = index < 0 ? value.length + index : index;
        value = value[idx];
      } else {
        // Not an array - log warning and return undefined
        KAISIGN_DEBUG && console.warn('[resolveFieldPath] Array syntax used on non-array:', {
          path: pathStr,
          part: part,
          valueType: typeof value,
          isString: typeof value === 'string',
          value: typeof value === 'string' ? value.substring(0, 50) : value
        });
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

  KAISIGN_DEBUG && console.log(`[applyFieldFormat] format="${format}", value=`, value, 'params=', params);

  // amount format - inline decimals + symbol from metadata params (no API lookup)
  // Used by ERC-20 approve metadata: {"format":"amount","params":{"decimals":18,"symbol":"wstETH"}}
  if (format === 'amount') {
    let valueStr;
    if (value && typeof value === 'object') {
      if (value._isBigNumber && value._value !== undefined) valueStr = value._value;
      else if (value._isBigNumber && value._hex) valueStr = BigInt(value._hex).toString();
      else valueStr = String(value);
    } else {
      valueStr = String(value);
    }
    const decimals = params.decimals !== undefined ? Number(params.decimals) : 18;
    const symbol = params.symbol || '';
    return formatTokenAmount(valueStr, decimals, symbol);
  }

  // tokenAmount format - fetch token metadata from Railway API
  if (format === 'tokenAmount') {
    const tokenPath = params.tokenPath;
    if (!tokenPath) {
      KAISIGN_DEBUG && console.warn('[applyFieldFormat] tokenAmount format missing tokenPath');
      return String(value);
    }

    // Resolve token address from params
    const tokenAddress = resolveFieldPath(tokenPath, allParams);
    KAISIGN_DEBUG && console.log('[applyFieldFormat] Token resolution:', {
      tokenPath: tokenPath,
      resolvedAddress: tokenAddress,
      allParamsKeys: Object.keys(allParams),
      pathParam: allParams.path,
      pathType: typeof allParams.path,
      pathIsArray: Array.isArray(allParams.path)
    });

    let decimals = 18; // Default
    let symbol = '';

    // Validate token address
    if (!tokenAddress || typeof tokenAddress !== 'string' || tokenAddress.length < 10) {
      KAISIGN_DEBUG && console.warn('[applyFieldFormat] Invalid or missing token address:', {
        tokenAddress,
        tokenPath,
        pathValue: allParams.path
      });
      // Use TOKEN placeholder - metadata fetch will fail
      symbol = 'TOKEN';
    } else if (tokenAddress) {
      // Handle native ETH addresses (including ERC-7730 nativeCurrencyAddress)
      const normalizedAddr = tokenAddress.toLowerCase();
      const nativeCurrency = params.nativeCurrencyAddress;
      const isNative = normalizedAddr === '0x0000000000000000000000000000000000000000' ||
        normalizedAddr === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' ||
        (nativeCurrency && normalizedAddr === nativeCurrency.toLowerCase());
      if (isNative) {
        decimals = 18;
        symbol = 'ETH';
      } else {
        // Fetch token metadata from Railway API
        try {
          const tokenInfo = await window.metadataService.getTokenMetadata(tokenAddress, chainId);
          KAISIGN_DEBUG && console.log('[applyFieldFormat] Token info from API:', tokenInfo);
          decimals = tokenInfo.decimals || 18;
          symbol = tokenInfo.symbol || '';
        } catch (error) {
          KAISIGN_DEBUG && console.warn('[applyFieldFormat] Failed to fetch token metadata:', error.message);
          symbol = `${tokenAddress.slice(0, 6)}...${tokenAddress.slice(-4)}`;
        }
      }
    }

    KAISIGN_DEBUG && console.log(`[applyFieldFormat] Resolved token: ${symbol} (${decimals} decimals)`);

    // Convert value to string - handle BigNumber objects from ethers.js
    // Prefer _value over _hex - _value is correct for signed integers (two's complement)
    let valueStr;
    if (value && typeof value === 'object') {
      if (value._isBigNumber && value._value !== undefined) {
        valueStr = value._value;
      } else if (value._isBigNumber && value._hex) {
        valueStr = BigInt(value._hex).toString();
      } else if (typeof value.toString === 'function') {
        valueStr = value.toString();
      } else {
        valueStr = String(value);
      }
    } else {
      valueStr = String(value);
    }
    KAISIGN_DEBUG && console.log(`[applyFieldFormat] Value string: ${valueStr}`);

    // Format the amount
    return formatTokenAmount(valueStr, decimals, symbol);
  }

  // ethAmount format - format wei value as ETH
  if (format === 'ethAmount') {
    // Convert value to string - handle BigNumber objects
    // Prefer _value over _hex - _value is correct for signed integers (two's complement)
    let valueStr;
    if (value && typeof value === 'object') {
      if (value._isBigNumber && value._value !== undefined) {
        valueStr = value._value;
      } else if (value._isBigNumber && value._hex) {
        valueStr = BigInt(value._hex).toString();
      } else {
        valueStr = String(value);
      }
    } else {
      valueStr = String(value);
    }
    KAISIGN_DEBUG && console.log(`[applyFieldFormat] ethAmount value: ${valueStr}`);
    return formatTokenAmount(valueStr, 18, 'ETH');
  }

  // addressName or addressOrName format - try to resolve to a human name
  // Order: ERC-20 symbol (WETH, wstETH) → contract name (ParaSwap Augustus V6) → shortened addr
  if (format === 'addressName' || format === 'addressOrName') {
    const addr = String(value).toLowerCase();
    const isShortenedFallback = (s) => typeof s === 'string' && /^0x[0-9a-f]{4}\.\.\.[0-9a-f]{4}$/i.test(s);
    if (window.metadataService && addr.startsWith('0x') && addr.length === 42) {
      try {
        const tokenInfo = await window.metadataService.getTokenMetadata(addr, chainId);
        // Real ERC-20 symbol: not the address-shortened fallback the service returns when symbol() reverts
        if (tokenInfo && tokenInfo.symbol && !isShortenedFallback(tokenInfo.symbol)) {
          return tokenInfo.symbol;
        }
        // Non-token contract: prefer the metadata name (e.g. "ParaSwap Augustus V6", "1inch Router V6")
        if (tokenInfo && tokenInfo.name && tokenInfo.name !== 'Unknown Token') {
          return tokenInfo.name;
        }
      } catch (e) {
        KAISIGN_DEBUG && console.log('[applyFieldFormat] Address name lookup failed:', e.message);
      }
    }
    // Fallback: shortened address
    if (addr.length === 42) {
      return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    }
    return String(value);
  }

  // Raw fallback - handle BigNumber objects
  // Prefer _value over _hex - _value is correct for signed integers (two's complement)
  if (value && typeof value === 'object' && '_isBigNumber' in value) {
    return value._value !== undefined ? value._value : (value._hex ? BigInt(value._hex).toString() : String(value));
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
window.SimpleInterface = SimpleInterface;

// Decoder ready

} // End of duplicate-load guard
