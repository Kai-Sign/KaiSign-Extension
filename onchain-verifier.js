/**
 * On-Chain Metadata Verifier
 *
 * Verifies fetched ERC-7730 metadata against the KaiSignRegistry merkle root
 * on Sepolia using the v1.0.0 two-leaf model.
 *
 * Trust boundary
 *   The contract's `merkleRoot()` is the only authority. The backend serves
 *   only `(chainId, extcodehash, metadata)` and is NEVER trusted for leaf
 *   hashes or proofs — those are computed locally so a compromised backend
 *   cannot forge attestations.
 *
 * Verification flow (v1.0.0 — 4-field leaf, two leaves per metadata)
 * 1. Compute extcodehash via eth_getCode + keccak256
 * 2. Compute metadataHash = keccak256(canonical(metadata))
 * 3. Build availabilityLeaf = keccak256(abi.encode(LEAF_TYPEHASH, chainId, extcodehash, metadataHash, false))
 *    Build revocationLeaf   = keccak256(abi.encode(LEAF_TYPEHASH, chainId, extcodehash, metadataHash, true))
 * 4. Generate proofs locally via merkle-tree.js (mirrors KaiSignRegistry._insertLeaf)
 * 5. Run verifyMerkleProof(leaf, proof, index, root) off-chain against the cached
 *    merkleRoot — same algorithm as KaiSignRegistry.sol:546-568
 *
 * Result mapping:
 *   availability ∈ tree && revocation ∉ tree  →  verified
 *   both ∈ tree                                →  revoked
 *   availability ∉ tree                        →  unattested
 *   no cached/fetched root                     →  root-unavailable
 */

// Guard against duplicate loading (MAIN world scripts can run multiple times)
if (window.onChainVerifier) {
  console.log('[KaiSign] On-chain verifier already loaded, skipping');
} else {

console.log('[KaiSign] On-chain verifier loading...');
const KAISIGN_DEBUG = false;

class OnChainVerifier {
  constructor(config = {}) {
    this.registryAddress = config.registryAddress || '0x122D1ad78FddA6829F104cb8cBB56E5561E56Ba8';

    // RPC URLs - local override is checked dynamically in _getRpcUrl()
    this.defaultRpcUrls = config.rpcUrls || [
      'https://ethereum-sepolia-rpc.publicnode.com',
      'https://rpc.sepolia.org'
    ];
    this.currentRpcIndex = 0;
    this.verificationCache = new Map(); // address-chainId -> verification result
    this.cacheTTL = config.cacheTTL || 300000; // 5 minutes

    // Verification mode: 'manual' (default) fetches the registry root once per
    // session and never polls; 'automatic' re-fetches the root and catches up
    // the leaf log on every verifyMetadataAgainstRoot call. Manual is the
    // privacy-default — every transaction decode in automatic mode leaks the
    // contract address being decoded to the configured RPC node.
    this.verificationMode = config.verificationMode || 'manual';
    this._rootFetchedThisSession = false;
    this._extcodehashCache = new Map(); // `${addr}-${chainId}` -> bytes32

    // Function selectors (computed from keccak256 of signatures)
    // getLatestSpecForBytecode(uint256,bytes32) -> first 4 bytes of keccak256
    // getAttestation(bytes32) -> first 4 bytes of keccak256
    // We'll compute these on init
    this.selectors = {};
    this._initSelectors();
    this._initSettings();
  }

  /**
   * Subscribe to settings: ask the bridge for current settings, then listen for
   * KAISIGN_SETTINGS_UPDATED broadcasts when the user changes them in the
   * options page. Falls back to the constructor default if the bridge is
   * unreachable (e.g. in the test harness).
   */
  _initSettings() {
    if (typeof window === 'undefined') return;

    const applySettings = (settings) => {
      if (!settings || typeof settings !== 'object') return;
      const next = settings.verificationMode === 'automatic' ? 'automatic' : 'manual';
      if (next !== this.verificationMode) {
        KAISIGN_DEBUG && console.log('[OnChainVerifier] verificationMode changed:', this.verificationMode, '->', next);
        this.verificationMode = next;
      }
    };

    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      const t = event.data?.type;
      if (t === 'KAISIGN_SETTINGS_RESPONSE' || t === 'KAISIGN_SETTINGS_UPDATED') {
        applySettings(event.data.settings);
      }
    });

    try {
      window.postMessage({ type: 'KAISIGN_GET_SETTINGS' }, '*');
    } catch { /* bridge may not be present in test harness */ }
  }

  /**
   * Compute function selectors for registry calls
   * Uses keccak256Simple from decode.js (loaded before this file)
   *
   * Note: `computeAttestationLeaf` was REMOVED in v1.0.0 — the verifier no
   * longer fetches a single per-uid leaf from the chain. The merkle root is
   * the authority, and proofs are generated locally by merkle-tree.js.
   */
  _initSelectors() {
    try {
      if (typeof keccak256Simple === 'function') {
        this.selectors.getLatestSpecForBytecode = keccak256Simple('getLatestSpecForBytecode(uint256,bytes32)').slice(0, 10);
        this.selectors.getAttestation = keccak256Simple('getAttestation(bytes32)').slice(0, 10);
        this.selectors.merkleRoot = keccak256Simple('merkleRoot()').slice(0, 10);
        this.LEAF_TYPEHASH = keccak256Simple(
          'RegistryLeaf(uint256 chainId,bytes32 extcodehash,bytes32 metadataHash,bool revoked)'
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
   * Checks localStorage dynamically for runtime changes from settings
   */
  _getRpcUrl() {
    // Check for local override (supports runtime settings changes)
    let localRpc = null;
    try { localRpc = localStorage.getItem('kaisign_local_rpc'); } catch { /* no localStorage */ }

    if (localRpc) {
      return localRpc;
    }

    return this.defaultRpcUrls[this.currentRpcIndex % this.defaultRpcUrls.length];
  }

  /**
   * Rotate to next RPC URL on failure
   */
  _rotateRpc() {
    this.currentRpcIndex = (this.currentRpcIndex + 1) % this.defaultRpcUrls.length;
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
    const cacheKey = `${address.toLowerCase()}-${chainId}`;
    if (this._extcodehashCache.has(cacheKey)) {
      return this._extcodehashCache.get(cacheKey);
    }

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
        this._extcodehashCache.set(cacheKey, null);
        return null; // EOA or empty contract
      }

      const hash = this.keccak256Bytes(bytecode);
      this._extcodehashCache.set(cacheKey, hash);
      return hash;
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
   * leafHash = keccak256(abi.encode(LEAF_TYPEHASH, chainId, extcodehash, metadataHash, revoked))
   *
   * v1.0.0: `idx` is no longer part of the leaf. Two leaves are derived per
   * metadata — one with revoked=false (availability) and one with revoked=true
   * (revocation). See verifyMetadataAgainstRoot for the two-leaf check.
   *
   * @param {Object} components - { chainId, extcodehash, metadataHash, revoked }
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
      this._encodeBool(components.revoked);

    return this.keccak256Bytes(encoded);
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
   * Fetch the current merkleRoot() from the registry contract.
   * @returns {Promise<string|null>} bytes32 merkle root, or null on RPC failure
   */
  async fetchMerkleRoot() {
    const selector = this.selectors.merkleRoot;
    if (!selector || selector.length !== 10 || !selector.startsWith('0x')) {
      throw new Error('merkleRoot selector not computed');
    }

    const result = await this.ethCallSepolia(this.registryAddress, selector);
    if (!result || result === '0x' || result.length < 66) {
      return null;
    }
    return '0x' + result.slice(2, 66);
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
   * Verify metadata via the v1.0.0 two-leaf merkle-proof flow.
   *
   * Steps:
   *   1. Compute extcodehash for the target contract
   *   2. Compute metadataHash = keccak256(canonical(metadata))
   *   3. Build availabilityLeaf (revoked=false) and revocationLeaf (revoked=true)
   *      from the new 4-field LEAF_TYPEHASH
   *   4. Resolve a current merkleRoot — load from cache if present, else fetch
   *      from `merkleRoot()` on the registry. The merkle-tree indexer keeps the
   *      cache fresh on its own TTL; this step is just the look-up.
   *   5. Ask the local merkle-tree indexer (window.kaisignMerkleTree) to prove
   *      each leaf's membership against the cached leaf set, and verify each
   *      proof off-chain via the same algorithm as KaiSignRegistry.verifyMerkleProof
   *
   * Result `source`:
   *   - 'merkle-verified'  : availability ∈ tree && revocation ∉ tree
   *   - 'revoked'          : both leaves ∈ tree
   *   - 'unattested'       : availability ∉ tree
   *   - 'root-unavailable' : couldn't fetch a root and nothing cached — UI should
   *                          surface a "click to refresh" affordance
   *
   * The cache key + result shape match the old `verifyMetadata` so the popup
   * badge code in content-script.js doesn't need to know about the model change.
   *
   * @param {Object} metadata - Fetched ERC-7730 metadata (must be the canonical blob the backend served)
   * @param {string} contractAddress - Contract address being verified
   * @param {number} chainId - Chain ID
   * @returns {Promise<Object>} Verification result
   */
  async verifyMetadataAgainstRoot(metadata, contractAddress, chainId) {
    const cacheKey = `${contractAddress.toLowerCase()}-${chainId}`;

    const cached = this.verificationCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.result;
    }

    const result = {
      verified: false,
      source: 'root-unavailable',
      details: null,
      availabilityLeaf: null,
      revocationLeaf: null,
      merkleRoot: null
    };

    try {
      // Step 1: extcodehash on the target chain
      const extcodehash = await this.getExtcodehash(contractAddress, chainId);
      if (!extcodehash) {
        result.details = 'Could not get contract bytecode hash';
        this._cacheResult(cacheKey, result);
        return result;
      }

      // Step 2: canonical metadata hash
      if (!metadata || typeof metadata !== 'object') {
        result.details = 'No metadata provided to verifier';
        this._cacheResult(cacheKey, result);
        return result;
      }
      const metadataHash = this.computeMetadataHash(metadata);

      // Step 3: build the two leaves
      const availabilityLeaf = this.computeLeafHash({
        chainId, extcodehash, metadataHash, revoked: false
      });
      const revocationLeaf = this.computeLeafHash({
        chainId, extcodehash, metadataHash, revoked: true
      });
      result.availabilityLeaf = availabilityLeaf;
      result.revocationLeaf = revocationLeaf;

      // Step 4: resolve a current merkleRoot.
      // Cache key is registry-scoped (not per-contract) — the registry holds one
      // global root, and storing it per-contract would just duplicate it.
      //
      // Manual mode: fetch from chain at most once per session (and only if the
      // localStorage cache is also empty). Automatic mode: always refetch so
      // the root is fresh for every verification.
      let root = this._loadRegistryMerkleRoot();
      const canFetchRoot = this.verificationMode === 'automatic'
        || (this.verificationMode === 'manual' && !root && !this._rootFetchedThisSession);
      if (canFetchRoot) {
        try {
          const fresh = await this.fetchMerkleRoot();
          if (fresh) {
            root = fresh;
            this._saveRegistryMerkleRoot(fresh);
          }
          this._rootFetchedThisSession = true;
        } catch (rpcErr) {
          KAISIGN_DEBUG && console.warn('[OnChainVerifier] merkleRoot fetch failed:', rpcErr.message);
        }
      }
      if (!root) {
        result.details = 'Could not fetch merkle root from registry and none cached';
        this._cacheResult(cacheKey, result);
        return result;
      }
      result.merkleRoot = root;

      // Step 5: ask the local indexer to prove each leaf
      const tree = (typeof window !== 'undefined') ? window.kaisignMerkleTree : null;
      if (!tree || typeof tree.proveLeaf !== 'function') {
        result.details = 'Merkle-tree indexer not loaded';
        this._cacheResult(cacheKey, result);
        return result;
      }

      // Make sure the local leaf set is canonical against `root` before trusting
      // any membership answer it gives. In manual mode we suppress the indexer's
      // catch-up RPC path — verification uses whatever leaves are already cached,
      // and a root mismatch falls through to the "unattested" branch without a
      // fresh eth_getLogs scan.
      const treeOk = await tree.ensureRootMatches(root, {
        skipCatchUp: this.verificationMode === 'manual'
      });
      if (!treeOk) {
        result.source = 'root-unavailable';
        result.details = 'Local merkle tree out of sync with on-chain root';
        this._cacheResult(cacheKey, result);
        return result;
      }

      const availabilityProof = tree.proveLeaf(availabilityLeaf);
      const revocationProof = tree.proveLeaf(revocationLeaf);

      const availabilityIn = availabilityProof
        ? this._verifyMerkleProofOffChain(availabilityLeaf, availabilityProof.proof, availabilityProof.index, root)
        : false;
      const revocationIn = revocationProof
        ? this._verifyMerkleProofOffChain(revocationLeaf, revocationProof.proof, revocationProof.index, root)
        : false;

      if (availabilityIn && !revocationIn) {
        result.verified = true;
        result.source = 'merkle-verified';
        result.details = 'Availability leaf proved against on-chain merkle root';
      } else if (availabilityIn && revocationIn) {
        result.verified = false;
        result.source = 'revoked';
        result.details = 'Attestation has been revoked on-chain';
      } else {
        result.verified = false;
        result.source = 'unattested';
        result.details = 'No attestation for this metadata in the registry merkle tree';
      }
    } catch (e) {
      result.details = `Verification error: ${e.message}`;
      console.warn('[OnChainVerifier] Verification failed:', e.message);
    }

    this._cacheResult(cacheKey, result);
    return result;
  }

  /**
   * Off-chain port of KaiSignRegistry.verifyMerkleProof (KaiSignRegistry.sol:546-568).
   *
   *   computedHash = leaf
   *   for each sibling in proof:
   *     if index even: computedHash = keccak256(computedHash || sibling)
   *     else:          computedHash = keccak256(sibling || computedHash)
   *     index = floor(index / 2)
   *   return computedHash == root
   *
   * @param {string} leaf - bytes32 hex
   * @param {string[]} proof - array of bytes32 hex sibling hashes from the leaf level upward
   * @param {number|bigint} index - leaf position in the tree (0-indexed)
   * @param {string} root - bytes32 hex root to check against
   */
  _verifyMerkleProofOffChain(leaf, proof, index, root) {
    let computed = leaf.toLowerCase();
    let pos = BigInt(index);
    for (let i = 0; i < proof.length; i++) {
      const sib = proof[i].toLowerCase();
      const concat = (pos % 2n === 0n)
        ? '0x' + computed.slice(2) + sib.slice(2)
        : '0x' + sib.slice(2) + computed.slice(2);
      computed = this.keccak256Bytes(concat);
      pos /= 2n;
    }
    return computed.toLowerCase() === root.toLowerCase();
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
    this._extcodehashCache.clear();
    this._rootFetchedThisSession = false;
  }

  // ============================================================================
  // Merkle Root Caching (registry-scoped, single global root per registry)
  // ============================================================================

  /**
   * The registry stores ONE global merkleRoot — there is no per-contract or
   * per-chain root. Cache key reflects that: keyed by registry address only.
   */
  _getRegistryMerkleRootKey() {
    return `kaisign_registry_root_${this.registryAddress.toLowerCase()}`;
  }

  _loadRegistryMerkleRoot() {
    try {
      return localStorage.getItem(this._getRegistryMerkleRootKey());
    } catch {
      return null;
    }
  }

  _saveRegistryMerkleRoot(root) {
    try {
      localStorage.setItem(this._getRegistryMerkleRootKey(), root);
      KAISIGN_DEBUG && console.log('[OnChainVerifier] Cached registry merkleRoot:', root.slice(0, 18));
    } catch (e) {
      console.warn('[OnChainVerifier] Failed to cache merkle root:', e.message);
    }
  }

  /**
   * Drop the cached merkle root and force the next verification to re-fetch.
   * Useful from the settings UI ("refresh verification data") and from devtools
   * via window.clearMerkleRootCache().
   */
  clearRegistryMerkleRoot() {
    try {
      localStorage.removeItem(this._getRegistryMerkleRootKey());
      KAISIGN_DEBUG && console.log('[OnChainVerifier] Cleared registry merkleRoot cache');
    } catch {
      // Ignore localStorage errors
    }
  }

  /**
   * Clear the cached registry merkleRoot AND any legacy per-contract roots
   * left over from pre-v1.0.0 builds (key prefix: 'kaisign_root_').
   */
  clearAllMerkleRoots() {
    this.clearRegistryMerkleRoot();
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('kaisign_root_')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      if (keysToRemove.length) {
        console.log('[OnChainVerifier] Cleared', keysToRemove.length, 'legacy per-contract merkle roots');
      }
    } catch (e) {
      console.warn('[OnChainVerifier] Failed to clear legacy merkle roots:', e.message);
    }
  }
}

// Initialize global instance
const onChainVerifier = new OnChainVerifier();

// Expose globally
window.onChainVerifier = onChainVerifier;

// Expose cache control for debugging
window.clearMerkleRootCache = () => {
  onChainVerifier.clearAllMerkleRoots();
};

console.log('[KaiSign] On-chain verifier ready');

} // End of duplicate-load guard
