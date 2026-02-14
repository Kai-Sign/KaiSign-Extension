/**
 * On-Chain Metadata Verifier
 *
 * Verifies fetched ERC-7730 metadata against on-chain leaf hashes stored in the
 * KaiSignRegistry contract on Sepolia.
 *
 * Verification flow (v1-core leaf hash):
 * 1. Get extcodehash of the contract via eth_getCode + keccak256
 * 2. Query registry: getLatestSpecForBytecode(chainId, extcodehash) → UID
 * 3. Query registry: getAttestation(uid) → parse Attestation struct → leaf components
 * 4. Compute leaf hash locally: keccak256(abi.encode(LEAF_TYPEHASH, chainId, extcodehash, metadataHash, idx, revoked))
 * 5. Query registry: computeAttestationLeaf(uid) → on-chain leaf hash
 * 6. Compare localLeaf === onChainLeaf
 */

// Guard against duplicate loading (MAIN world scripts can run multiple times)
if (window.onChainVerifier) {
  console.log('[KaiSign] On-chain verifier already loaded, skipping');
} else {

console.log('[KaiSign] On-chain verifier loading...');
const KAISIGN_DEBUG = false;

class OnChainVerifier {
  constructor(config = {}) {
    this.registryAddress = config.registryAddress || '0xC203e8C22eFCA3C9218a6418f6d4281Cb7744dAa';

    // Check for local override (set via: localStorage.setItem('kaisign_local_rpc', 'http://localhost:3000/rpc'))
    let localRpc = null;
    try { localRpc = localStorage.getItem('kaisign_local_rpc'); } catch { /* no localStorage */ }

    this.rpcUrls = localRpc ? [localRpc] : (config.rpcUrls || [
      'https://ethereum-sepolia-rpc.publicnode.com',
      'https://rpc.sepolia.org'
    ]);
    this.currentRpcIndex = 0;
    this.verificationCache = new Map(); // address-chainId -> verification result
    this.cacheTTL = config.cacheTTL || 300000; // 5 minutes

    // Function selectors (computed from keccak256 of signatures)
    // getLatestSpecForBytecode(uint256,bytes32) -> first 4 bytes of keccak256
    // getAttestation(bytes32) -> first 4 bytes of keccak256
    // We'll compute these on init
    this.selectors = {};
    this._initSelectors();
  }

  /**
   * Compute function selectors for registry calls
   * Uses keccak256Simple from decode.js (loaded before this file)
   */
  _initSelectors() {
    try {
      if (typeof keccak256Simple === 'function') {
        this.selectors.getLatestSpecForBytecode = keccak256Simple('getLatestSpecForBytecode(uint256,bytes32)').slice(0, 10);
        this.selectors.getAttestation = keccak256Simple('getAttestation(bytes32)').slice(0, 10);
        this.selectors.computeAttestationLeaf = keccak256Simple('computeAttestationLeaf(bytes32)').slice(0, 10);
        this.selectors.verifyAttestationInclusion = keccak256Simple('verifyAttestationInclusion(bytes32,bytes32[])').slice(0, 10);
        this.LEAF_TYPEHASH = keccak256Simple(
          'RegistryLeaf(uint256 chainId,bytes32 extcodehash,bytes32 metadataHash,uint256 idx,bool revoked)'
        );
        KAISIGN_DEBUG && console.log('[OnChainVerifier] Selectors computed:', this.selectors);
      } else {
        // Fallback: selectors stay empty, verification will gracefully skip
        KAISIGN_DEBUG && console.warn('[OnChainVerifier] keccak256Simple not available, selectors not computed');
        this.selectors = {};
      }
    } catch (e) {
      KAISIGN_DEBUG && console.warn('[OnChainVerifier] Failed to compute selectors:', e.message);
    }
  }

  /**
   * Get the current RPC URL, rotating on failure
   */
  _getRpcUrl() {
    return this.rpcUrls[this.currentRpcIndex % this.rpcUrls.length];
  }

  /**
   * Rotate to next RPC URL on failure
   */
  _rotateRpc() {
    this.currentRpcIndex = (this.currentRpcIndex + 1) % this.rpcUrls.length;
  }

  /**
   * Make an RPC call via the bridge -> background -> fetch pipeline
   * @param {string} method - JSON-RPC method (e.g., 'eth_call')
   * @param {Array} params - JSON-RPC params
   * @param {string} rpcUrl - Optional override RPC URL
   * @returns {Promise<string>} RPC result
   */
  async rpcCall(method, params, rpcUrl) {
    const url = rpcUrl || this._getRpcUrl();

    return new Promise((resolve, reject) => {
      const messageId = 'rpc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      let settled = false;

      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        window.removeEventListener('message', handler);
        reject(new Error('RPC call timeout'));
      }, 15000);

      const handler = (event) => {
        if (event.data.type === 'KAISIGN_RPC_RESPONSE' && event.data.messageId === messageId) {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          window.removeEventListener('message', handler);
          if (event.data.error) {
            reject(new Error(event.data.error));
          } else {
            resolve(event.data.result);
          }
        }
      };

      window.addEventListener('message', handler);

      window.postMessage({
        type: 'KAISIGN_RPC_CALL',
        messageId,
        rpcUrl: url,
        method,
        params
      }, '*');
    });
  }

  /**
   * Fetch a URL via the bridge -> background pipeline (CORS bypass)
   * @param {string} url - URL to fetch
   * @returns {Promise<string>} Response text
   */
  async fetchViaBackground(url) {
    return new Promise((resolve, reject) => {
      const messageId = 'verifier-fetch-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      let settled = false;

      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        window.removeEventListener('message', handler);
        reject(new Error('Fetch timeout'));
      }, 15000);

      const handler = (event) => {
        if (event.data.type === 'KAISIGN_BLOB_RESPONSE' && event.data.messageId === messageId) {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          window.removeEventListener('message', handler);
          if (event.data.error) {
            reject(new Error(event.data.error));
          } else {
            resolve(event.data.data);
          }
        }
      };

      window.addEventListener('message', handler);

      window.postMessage({
        type: 'KAISIGN_FETCH_BLOB',
        messageId,
        url
      }, '*');
    });
  }

  /**
   * Make an eth_call to a contract on Sepolia
   * @param {string} to - Contract address
   * @param {string} data - Encoded calldata
   * @returns {Promise<string>} Return data
   */
  async ethCallSepolia(to, data) {
    try {
      const result = await this.rpcCall('eth_call', [{ to, data }, 'latest']);
      return result;
    } catch (e) {
      // Try rotating RPC
      this._rotateRpc();
      return await this.rpcCall('eth_call', [{ to, data }, 'latest']);
    }
  }

  /**
   * Get the bytecode of a contract and compute its keccak256 hash (extcodehash)
   * @param {string} address - Contract address
   * @param {number} chainId - Chain ID
   * @returns {Promise<string>} extcodehash (bytes32 hex string)
   */
  async getExtcodehash(address, chainId) {
    // Use the dapp's own RPC (via window.ethereum) to get bytecode on the target chain
    try {
      let bytecode;
      if (typeof window !== 'undefined' && window.ethereum) {
        bytecode = await window.ethereum.request({
          method: 'eth_getCode',
          params: [address, 'latest']
        });
      } else {
        throw new Error('No ethereum provider');
      }

      if (!bytecode || bytecode === '0x') {
        return null; // EOA or empty contract
      }

      // Compute keccak256 of the bytecode
      return this.keccak256Bytes(bytecode);
    } catch (e) {
      KAISIGN_DEBUG && console.warn('[OnChainVerifier] Failed to get extcodehash:', e.message);
      return null;
    }
  }

  /**
   * Compute keccak256 of raw hex bytes (not UTF-8 string)
   * @param {string} hexData - Hex data with 0x prefix
   * @returns {string} keccak256 hash with 0x prefix
   */
  keccak256Bytes(hexData) {
    // Try ethers first
    if (typeof window !== 'undefined') {
      if (window.ethers?.keccak256) {
        try { return window.ethers.keccak256(hexData); } catch {}
      }
      if (window.ethers?.utils?.keccak256) {
        try { return window.ethers.utils.keccak256(hexData); } catch {}
      }
    }

    // Pure JS keccak256 on raw bytes
    return this._keccak256RawBytes(hexData);
  }

  /**
   * Pure JS keccak256 for raw byte input (hex-encoded)
   * Reuses the same keccak permutation from decode.js but operates on bytes, not UTF-8 strings
   */
  _keccak256RawBytes(hexData) {
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

    // Convert hex to byte array
    const hex = hexData.startsWith('0x') ? hexData.slice(2) : hexData;
    const input = new Uint8Array(hex.length / 2);
    for (let i = 0; i < input.length; i++) {
      input[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }

    const rate = 136;
    const state = new Array(25).fill(0n);

    const padded = new Uint8Array(Math.ceil((input.length + 1) / rate) * rate);
    padded.set(input);
    padded[input.length] = 0x01;
    padded[padded.length - 1] |= 0x80;

    for (let i = 0; i < padded.length; i += rate) {
      for (let j = 0; j < rate && j < 200; j += 8) {
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

  /**
   * ABI-encode a uint256 value as a 32-byte hex string (no 0x prefix)
   */
  _encodeUint256(value) {
    return BigInt(value).toString(16).padStart(64, '0');
  }

  /**
   * ABI-encode a bytes32 value as a 32-byte hex string (no 0x prefix)
   */
  _encodeBytes32(value) {
    const hex = value.startsWith('0x') ? value.slice(2) : value;
    return hex.padStart(64, '0');
  }

  /**
   * ABI-encode a bool value as a 32-byte hex string (no 0x prefix)
   */
  _encodeBool(value) {
    return value ? '0'.repeat(63) + '1' : '0'.repeat(64);
  }

  /**
   * Compute leaf hash from leaf components (mirrors Solidity struct hashing)
   * leafHash = keccak256(abi.encode(LEAF_TYPEHASH, chainId, extcodehash, metadataHash, idx, revoked))
   * @param {Object} components - { chainId, extcodehash, metadataHash, idx, revoked }
   * @returns {string} keccak256 hash with 0x prefix
   */
  computeLeafHash(components) {
    const typeHash = this.LEAF_TYPEHASH;
    if (!typeHash) {
      throw new Error('LEAF_TYPEHASH not initialized');
    }

    const encoded = '0x' +
      this._encodeBytes32(typeHash) +
      this._encodeUint256(components.chainId) +
      this._encodeBytes32(components.extcodehash) +
      this._encodeBytes32(components.metadataHash) +
      this._encodeUint256(components.idx) +
      this._encodeBool(components.revoked);

    return this.keccak256Bytes(encoded);
  }

  /**
   * Fetch leaf data from KaiSign API by leaf hash
   * @param {string} leafHash - Leaf hash from on-chain registry
   * @returns {Promise<Object|null>} { uid, leaf_hash, leaf_components } or null
   */
  async fetchLeafData(leafHash) {
    try {
      const hash = leafHash.startsWith('0x') ? leafHash : '0x' + leafHash;
      let apiBase = 'https://kai-sign-production.up.railway.app';
      try { apiBase = localStorage.getItem('kaisign_local_api') || apiBase; } catch { /* no localStorage */ }
      const url = `${apiBase}/api/py/metadata/hash/${hash}`;
      const response = await this.fetchViaBackground(url);
      const data = JSON.parse(response);
      if (!data || !data.uid || !data.leaf_hash) {
        KAISIGN_DEBUG && console.warn('[OnChainVerifier] API returned incomplete leaf data');
        return null;
      }
      return data;
    } catch (e) {
      KAISIGN_DEBUG && console.warn('[OnChainVerifier] Failed to fetch leaf data:', e.message);
      return null;
    }
  }

  /**
   * Call computeAttestationLeaf(uid) on the registry contract
   * @param {string} uid - Attestation UID (bytes32)
   * @returns {Promise<string|null>} bytes32 leaf hash or null
   */
  async getOnChainLeaf(uid) {
    try {
      const selector = this.selectors.computeAttestationLeaf;
      if (!selector || selector.length !== 10 || !selector.startsWith('0x')) {
        throw new Error('computeAttestationLeaf selector not computed');
      }

      const calldata = selector + this._encodeBytes32(uid);
      const result = await this.ethCallSepolia(this.registryAddress, calldata);

      if (!result || result === '0x' || result.length < 66) {
        return null;
      }

      return '0x' + result.slice(2, 66);
    } catch (e) {
      KAISIGN_DEBUG && console.warn('[OnChainVerifier] Failed to get on-chain leaf:', e.message);
      return null;
    }
  }

  /**
   * Query registry for latest spec by bytecode hash
   * @param {number} chainId - Target chain ID
   * @param {string} extcodehash - Contract bytecode hash (bytes32)
   * @returns {Promise<{uid: string, valid: boolean}>}
   */
  async getLatestSpec(chainId, extcodehash) {
    const selector = this.selectors.getLatestSpecForBytecode;
    if (!selector || selector.length !== 10 || !selector.startsWith('0x')) {
      throw new Error('Selector not computed');
    }

    const calldata = selector +
      this._encodeUint256(chainId) +
      this._encodeBytes32(extcodehash);

    const result = await this.ethCallSepolia(this.registryAddress, calldata);

    if (!result || result === '0x' || result.length < 66) {
      return { uid: null, valid: false };
    }

    // Return value is a bytes32 UID
    const uid = '0x' + result.slice(2, 66);
    const isZero = uid === '0x' + '0'.repeat(64);

    return { uid: isZero ? null : uid, valid: !isZero };
  }

  /**
   * Get attestation leaf components from the registry by calling getAttestation(uid)
   * Parses the KaiSign Attestation struct directly from the on-chain response.
   *
   * KaiSign Attestation struct layout:
   *   word[0]: uid (bytes32)
   *   word[1]: chainId (uint256)
   *   word[2]: extcodehash (bytes32)
   *   word[3]: blobHash (bytes32) — EIP-4844 blob hash, NOT used in leaf
   *   word[4]: metadataHash (bytes32) — keccak256(canonical(metadata))
   *   word[5]: attester (address)
   *   word[6]: timestamp (uint64)
   *   word[7]: idx (uint64)
   *   word[8]: revoked (bool)
   *   word[9]: finalizedAt (uint64)
   *   word[10]: revokeProposedAt (uint64)
   *
   * @param {string} uid - Attestation UID (bytes32)
   * @returns {Promise<Object|null>} { chainId, extcodehash, metadataHash, idx, revoked } or null
   */
  async getAttestationComponents(uid) {
    const selector = this.selectors.getAttestation;
    if (!selector || selector.length !== 10 || !selector.startsWith('0x')) {
      throw new Error('Selector not computed');
    }

    const calldata = selector + this._encodeBytes32(uid);
    const result = await this.ethCallSepolia(this.registryAddress, calldata);

    if (!result || result === '0x' || result.length < 66) {
      return null;
    }

    try {
      const hex = result.slice(2); // remove 0x

      // Need at least 11 words (704 hex chars) for the full struct
      if (hex.length < 704) {
        KAISIGN_DEBUG && console.warn('[OnChainVerifier] Response too short for Attestation struct');
        return null;
      }

      // Parse the struct fields used in leaf computation
      const chainId = Number(BigInt('0x' + hex.slice(64, 128)));
      const extcodehash = '0x' + hex.slice(128, 192);
      // word[3] is blobHash (skip)
      const metadataHash = '0x' + hex.slice(256, 320);
      const idx = Number(BigInt('0x' + hex.slice(448, 512)));
      const revoked = BigInt('0x' + hex.slice(512, 576)) !== 0n;

      return { chainId, extcodehash, metadataHash, idx, revoked };
    } catch (e) {
      KAISIGN_DEBUG && console.warn('[OnChainVerifier] Failed to decode attestation struct:', e.message);
      return null;
    }
  }

  /**
   * Compute the canonical hash of metadata JSON
   * Uses deterministic JSON serialization (sorted keys)
   * @param {Object} metadata - ERC-7730 metadata object
   * @returns {string} keccak256 hash with 0x prefix
   */
  computeMetadataHash(metadata) {
    const canonical = this._canonicalStringify(metadata);
    // Convert string to hex bytes for hashing
    const encoder = new TextEncoder();
    const bytes = encoder.encode(canonical);
    let hexStr = '0x';
    for (const b of bytes) {
      hexStr += b.toString(16).padStart(2, '0');
    }
    return this.keccak256Bytes(hexStr);
  }

  /**
   * Deterministic JSON.stringify with sorted keys
   */
  _canonicalStringify(obj) {
    return JSON.stringify(obj, (key, value) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return Object.keys(value).sort().reduce((sorted, k) => {
          sorted[k] = value[k];
          return sorted;
        }, {});
      }
      return value;
    });
  }

  /**
   * Full verification flow using on-chain attestation struct
   * 1. Get extcodehash of the contract on the target chain
   * 2. Query registry: getLatestSpecForBytecode(chainId, extcodehash) → UID
   * 3. Query registry: getAttestation(uid) → parse Attestation struct → leaf components
   * 4. Compute leaf hash locally from the parsed components
   * 5. Query registry: computeAttestationLeaf(uid) → on-chain leaf hash
   * 6. Compare: local leaf hash must equal on-chain leaf hash
   *
   * @param {Object} metadata - Fetched ERC-7730 metadata (unused in new flow, kept for interface compat)
   * @param {string} contractAddress - Contract address being verified
   * @param {number} chainId - Chain ID
   * @returns {Promise<Object>} Verification result
   */
  async verifyMetadata(metadata, contractAddress, chainId) {
    const cacheKey = `${contractAddress.toLowerCase()}-${chainId}`;

    // Check cache
    const cached = this.verificationCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.result;
    }

    const result = {
      verified: false,
      source: 'api-only',
      details: null,
      hash: null,
      onChainHash: null
    };

    try {
      // Step 1: Get extcodehash of the contract on the target chain
      const extcodehash = await this.getExtcodehash(contractAddress, chainId);
      if (!extcodehash) {
        result.details = 'Could not get contract bytecode hash';
        this._cacheResult(cacheKey, result);
        return result;
      }

      // Step 2: Query registry for latest attestation UID
      KAISIGN_DEBUG && console.log('[OnChainVerifier] extcodehash:', extcodehash);
      const spec = await this.getLatestSpec(chainId, extcodehash);
      KAISIGN_DEBUG && console.log('[OnChainVerifier] Registry UID:', spec.uid, 'valid:', spec.valid);
      if (!spec.valid || !spec.uid) {
        result.details = 'No attestation found on-chain for this contract';
        this._cacheResult(cacheKey, result);
        return result;
      }

      // Step 3: Get attestation struct and parse leaf components
      const components = await this.getAttestationComponents(spec.uid);
      if (!components) {
        result.details = 'Could not parse attestation struct';
        this._cacheResult(cacheKey, result);
        return result;
      }

      // Step 4: Compute leaf hash locally from parsed components
      const recomputedLeaf = this.computeLeafHash(components);
      result.hash = recomputedLeaf;

      // Step 5: Get on-chain leaf hash from computeAttestationLeaf(uid)
      const onChainLeaf = await this.getOnChainLeaf(spec.uid);
      if (!onChainLeaf) {
        result.details = 'Could not compute on-chain leaf hash';
        this._cacheResult(cacheKey, result);
        return result;
      }
      result.onChainHash = onChainLeaf;
      KAISIGN_DEBUG && console.log('[OnChainVerifier] On-chain leaf:', onChainLeaf.slice(0, 18), 'Recomputed:', recomputedLeaf.slice(0, 18));

      // Step 6: Compare recomputed vs on-chain
      if (recomputedLeaf.toLowerCase() === onChainLeaf.toLowerCase()) {
        result.verified = true;
        result.source = 'leaf-verified';
        result.details = 'Leaf hash verified against on-chain registry';
        console.log('[OnChainVerifier] Leaf VERIFIED');
      } else {
        result.verified = false;
        result.source = 'mismatch';
        result.details = `Leaf mismatch: recomputed=${recomputedLeaf.slice(0, 10)}... on-chain=${onChainLeaf.slice(0, 10)}...`;
        console.warn('[OnChainVerifier] Leaf mismatch:', { recomputedLeaf, onChainLeaf });
      }
    } catch (e) {
      result.details = `Verification error: ${e.message}`;
      console.warn('[OnChainVerifier] Verification failed:', e.message);
    }

    this._cacheResult(cacheKey, result);
    return result;
  }

  /**
   * Cache a verification result
   */
  _cacheResult(key, result) {
    this.verificationCache.set(key, {
      result,
      timestamp: Date.now()
    });
  }

  /**
   * Clear verification cache
   */
  clearCache() {
    this.verificationCache.clear();
  }
}

// Initialize global instance
const onChainVerifier = new OnChainVerifier();

// Expose globally
window.onChainVerifier = onChainVerifier;

console.log('[KaiSign] On-chain verifier ready');

} // End of duplicate-load guard
