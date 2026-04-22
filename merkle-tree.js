/**
 * merkle-tree.js — Local KaiSignRegistry merkle-tree replay + proof generator
 *
 * Why this file exists
 *   The contract uses an incremental Merkle tree (`_insertLeaf` at
 *   KaiSignRegistry.sol:576-590). Off-chain proof generation requires the
 *   FULL tree — the contract only stores `filledSubtrees` (just enough for the
 *   next root, not for arbitrary historical proofs). So we rebuild the tree
 *   client-side by indexing the events that drive `_insertLeaf` and replaying
 *   them through the same algorithm.
 *
 * Trust boundary
 *   The contract's `merkleRoot()` is the only authority. After each replay we
 *   recompute the root locally and compare against `merkleRoot()`. If they
 *   match, the local tree is canonical and any proof derived from it is valid.
 *   If they DON'T match (reorg, missed event, RPC lying about logs), drop all
 *   local state and re-index from the registry's deploy block.
 *
 * Insertion order — this is THE critical invariant
 *   The contract assigns leaf positions via the monotonic `currentIdx`
 *   counter. Both APPROVED `finalize()` (KaiSignRegistry.sol:392) and
 *   APPROVED `finalizeRevoke()` (:513) call `_insertLeaf(leaf, currentIdx-1)`
 *   after `++currentIdx`. So tree position = sequence of (approved finalize +
 *   approved revoke) events, ordered by `(blockNumber, logIndex)` across
 *   BOTH event types. SpecIndexed and RevokeFinalized(true) are the two
 *   corresponding events emitted with the same ordering.
 *
 * Storage
 *   localStorage['kaisign_leaf_log_<registryAddress>']
 *     = { lastBlock: number, treeDepth: number, leaves: [{leaf, blockNumber, logIndex}, ...] }
 *
 *   Per-origin (extension content scripts share a storage partition with the
 *   page origin). Each new origin re-indexes from genesis. Acceptable because
 *   registry growth is bounded.
 *
 * Public surface (read by onchain-verifier.js)
 *   window.kaisignMerkleTree.ensureRootMatches(expectedRoot) -> Promise<boolean>
 *   window.kaisignMerkleTree.proveLeaf(leafHash) -> {proof: string[], index: number} | null
 *   window.kaisignMerkleTree.clear() -> void
 *   window.kaisignMerkleTree.stats() -> {leafCount, root, lastBlock}
 *
 * Reviewer checklist
 *   - `_insertLeaf` JS port matches contract bit-for-bit (zero-pad with
 *     `zeroHashes[level]`, swap order on odd positions).
 *   - Event ordering uses `(blockNumber, logIndex)` lexicographically; never
 *     trust a single event's `transactionIndex` alone.
 *   - On root mismatch, state is wiped before re-index — never serve a proof
 *     against a tree whose local root disagrees with the chain.
 */

if (window.kaisignMerkleTree) {
  console.log('[KaiSign] Merkle tree indexer already loaded, skipping');
} else {

console.log('[KaiSign] Merkle tree indexer loading...');
const MERKLE_DEBUG = false;

// keccak256 of the indexed event signatures
//   SpecIndexed(bytes32,uint256,bytes32,bytes32,address)
//   RevokeFinalized(bytes32,bool)
//   MerkleRootUpdated(bytes32)  -- not consumed for leaf data, but useful as a sanity beacon
// Computed lazily so we can use keccak256Simple from decode.js (loaded earlier).
function _topic(signature) {
  if (typeof keccak256Simple !== 'function') return null;
  return keccak256Simple(signature);
}

class KaiSignMerkleTree {
  constructor(config = {}) {
    // Defaults align with onchain-verifier.js — change them together.
    this.registryAddress = (config.registryAddress
      || '0xb910E44893713b072ABC6949fB4441ad09999bC6').toLowerCase();

    // Block to start log scans from on a fresh / wiped index. Operators can
    // override via localStorage['kaisign_registry_deploy_block_<addr>'] when
    // the registry is redeployed. Pre-deploy blocks just return zero logs.
    this.defaultDeployBlock = config.deployBlock || 5_500_000; // Sepolia, conservative

    // Cap log-scan range per request to avoid RPC timeouts on large gaps.
    // Public Sepolia RPCs reject ranges > 10k blocks.
    this.maxLogRange = config.maxLogRange || 5000;

    // RPC pacing — share state with the verifier so we rotate together.
    this.verifier = null; // resolved lazily in _ethCall

    this.treeDepth = null; // fetched once via treeDepth() and pinned per-load
    this.zeroHashes = null; // precomputed once we know depth
    this.indexing = false; // mutex against concurrent ensureRootMatches calls
    this.lastIndexAttempt = 0;
    this.indexBackoffMs = 5000; // floor between failed attempts

    this._loadFromStorage();
  }

  // ============================================================================
  // Storage
  // ============================================================================

  _storageKey() {
    return `kaisign_leaf_log_${this.registryAddress}`;
  }

  _loadFromStorage() {
    try {
      const raw = localStorage.getItem(this._storageKey());
      if (!raw) {
        this.state = { lastBlock: null, treeDepth: null, leaves: [] };
        return;
      }
      const parsed = JSON.parse(raw);
      this.state = {
        lastBlock: parsed.lastBlock ?? null,
        treeDepth: parsed.treeDepth ?? null,
        leaves: Array.isArray(parsed.leaves) ? parsed.leaves : []
      };
      MERKLE_DEBUG && console.log('[MerkleTree] Loaded', this.state.leaves.length, 'leaves from storage');
    } catch (e) {
      console.warn('[MerkleTree] Failed to load leaf log:', e.message);
      this.state = { lastBlock: null, treeDepth: null, leaves: [] };
    }
  }

  _saveToStorage() {
    try {
      localStorage.setItem(this._storageKey(), JSON.stringify(this.state));
    } catch (e) {
      console.warn('[MerkleTree] Failed to persist leaf log:', e.message);
    }
  }

  clear() {
    this.state = { lastBlock: null, treeDepth: null, leaves: [] };
    try {
      localStorage.removeItem(this._storageKey());
    } catch { /* localStorage unavailable */ }
    MERKLE_DEBUG && console.log('[MerkleTree] Local state cleared');
  }

  stats() {
    return {
      leafCount: this.state.leaves.length,
      lastBlock: this.state.lastBlock,
      treeDepth: this.state.treeDepth,
      root: this._computeLocalRoot()
    };
  }

  // ============================================================================
  // RPC plumbing — piggy-back on the verifier's bridge
  // ============================================================================

  _resolveVerifier() {
    if (!this.verifier && typeof window !== 'undefined') {
      this.verifier = window.onChainVerifier || null;
    }
    if (!this.verifier) {
      throw new Error('onChainVerifier not loaded — merkle tree cannot reach RPC');
    }
    return this.verifier;
  }

  async _rpc(method, params) {
    return this._resolveVerifier().rpcCall(method, params);
  }

  async _ethCall(data) {
    return this._resolveVerifier().ethCallSepolia(this.registryAddress, data);
  }

  _keccakBytes(hex) {
    return this._resolveVerifier().keccak256Bytes(hex);
  }

  // ============================================================================
  // Tree depth + zero hashes (mirrors KaiSignRegistry constructor :144-148)
  // ============================================================================

  async _ensureTreeDepth() {
    if (this.treeDepth !== null) return this.treeDepth;

    // First check the cached value from storage — saves an RPC on warm start.
    if (this.state.treeDepth) {
      this.treeDepth = this.state.treeDepth;
      this._buildZeroHashes();
      return this.treeDepth;
    }

    if (typeof keccak256Simple !== 'function') {
      throw new Error('keccak256Simple unavailable — cannot derive treeDepth() selector');
    }
    const selector = keccak256Simple('treeDepth()').slice(0, 10);
    const result = await this._ethCall(selector);
    if (!result || result === '0x' || result.length < 66) {
      throw new Error('treeDepth() returned empty');
    }
    const depth = Number(BigInt('0x' + result.slice(2, 66)));
    if (!Number.isInteger(depth) || depth <= 0 || depth > 32) {
      throw new Error(`Invalid treeDepth ${depth}`);
    }
    this.treeDepth = depth;
    this.state.treeDepth = depth;
    this._buildZeroHashes();
    this._saveToStorage();
    MERKLE_DEBUG && console.log('[MerkleTree] treeDepth =', depth);
    return depth;
  }

  _buildZeroHashes() {
    // zeroHashes[i] is the hash of an all-zero subtree of height i.
    // Mirrors KaiSignRegistry.sol:144-148.
    const depth = this.treeDepth;
    const zh = new Array(depth);
    let z = '0x' + '0'.repeat(64);
    for (let i = 0; i < depth; i++) {
      zh[i] = z;
      // keccak256(abi.encodePacked(z, z))
      z = this._keccakBytes('0x' + z.slice(2) + z.slice(2));
    }
    this.zeroHashes = zh;
  }

  // ============================================================================
  // Tree replay + proof generation
  // ============================================================================

  /**
   * JS port of KaiSignRegistry._insertLeaf (:576-590).
   *
   * The contract maintains `filledSubtrees[level]` as the most recent
   * left-child hash at each level — sufficient to compute the next root, but
   * NOT sufficient to prove arbitrary historical leaves. So instead of mirroring
   * `filledSubtrees`, we build the entire tree by levels here. Cost is O(2^depth)
   * memory worst case but in practice we have a sparse tree (one entry per leaf)
   * and `_buildLevel` only walks populated parents.
   *
   * Returns {root, levels} where levels[0] is leaves keyed by position,
   * levels[depth] is the single root.
   */
  _buildTree() {
    const depth = this.treeDepth;
    const leaves = this.state.leaves;

    // Level 0: leaf hashes by position. Position = insertion order = array index.
    const levels = new Array(depth + 1);
    levels[0] = new Map();
    for (let i = 0; i < leaves.length; i++) {
      levels[0].set(i, leaves[i].leaf.toLowerCase());
    }

    for (let level = 0; level < depth; level++) {
      const child = levels[level];
      const parent = new Map();

      // Walk only positions that exist at this level. Each parent at position
      // (pos >> 1) is touched at most twice (once per child). Use a set of
      // unique parent positions to avoid double-work.
      const parentPositions = new Set();
      for (const childPos of child.keys()) {
        parentPositions.add(childPos >> 1);
      }

      for (const pPos of parentPositions) {
        const leftPos = pPos * 2;
        const rightPos = pPos * 2 + 1;
        const left = child.get(leftPos) || this.zeroHashes[level];
        const right = child.get(rightPos) || this.zeroHashes[level];
        const concat = '0x' + left.slice(2) + right.slice(2);
        parent.set(pPos, this._keccakBytes(concat));
      }

      levels[level + 1] = parent;
    }

    // The contract's root is whatever the FRONTIER yields after `currentIdx`
    // insertions — which equals the top-level value at position 0 if any leaves
    // exist, or the all-zero subtree of full depth if the tree is empty.
    const top = levels[depth];
    let root;
    if (leaves.length === 0) {
      // Empty tree: contract's merkleRoot is bytes32(0) until the first insert.
      // (See KaiSignRegistry storage default; `_insertLeaf` is what first sets it.)
      root = '0x' + '0'.repeat(64);
    } else {
      root = top.get(0) || '0x' + '0'.repeat(64);
    }

    return { root, levels };
  }

  _computeLocalRoot() {
    if (!this.treeDepth || !this.zeroHashes) return null;
    return this._buildTree().root;
  }

  /**
   * Generate a merkle proof for a leaf hash.
   * Walks up from the leaf's position, emitting the sibling hash at each level.
   *
   * @param {string} leafHash - bytes32 hex (case-insensitive, 0x-prefixed)
   * @returns {{proof: string[], index: number} | null} null if leaf not in tree
   */
  proveLeaf(leafHash) {
    if (!this.treeDepth || !this.zeroHashes) return null;
    const target = leafHash.toLowerCase();

    // Find the leaf's insertion position.
    let index = -1;
    for (let i = 0; i < this.state.leaves.length; i++) {
      if (this.state.leaves[i].leaf.toLowerCase() === target) {
        index = i;
        break;
      }
    }
    if (index === -1) return null;

    const { levels } = this._buildTree();
    const proof = [];
    let pos = index;
    for (let level = 0; level < this.treeDepth; level++) {
      const siblingPos = pos % 2 === 0 ? pos + 1 : pos - 1;
      const sibling = levels[level].get(siblingPos) || this.zeroHashes[level];
      proof.push(sibling);
      pos = pos >> 1;
    }
    return { proof, index };
  }

  // ============================================================================
  // Indexer — pulls SpecIndexed + RevokeFinalized(true) since lastBlock
  // ============================================================================

  /**
   * Bring the local leaf log up to date and verify against the on-chain root.
   *
   * Called by onchain-verifier.js before serving a proof. Idempotent and
   * mutex'd against concurrent calls. Returns true iff the local tree's
   * computed root equals `expectedRoot`.
   */
  async ensureRootMatches(expectedRoot) {
    if (!expectedRoot) return false;

    // Mutex: serialize indexer runs across simultaneous verification calls.
    if (this.indexing) {
      // Wait briefly for the in-flight indexer rather than racing it.
      const waited = await this._waitForIndexer(8000);
      if (!waited) return false;
    }

    // Cheap path: local root already matches without any RPC work.
    try {
      await this._ensureTreeDepth();
      const localRootBefore = this._computeLocalRoot();
      if (localRootBefore && localRootBefore.toLowerCase() === expectedRoot.toLowerCase()) {
        return true;
      }
    } catch (e) {
      MERKLE_DEBUG && console.warn('[MerkleTree] depth/root precheck failed:', e.message);
    }

    // Backoff: don't hammer RPC if a recent attempt failed.
    const sinceLast = Date.now() - this.lastIndexAttempt;
    if (sinceLast < this.indexBackoffMs && this.lastIndexAttempt !== 0) {
      MERKLE_DEBUG && console.log('[MerkleTree] backoff; skipping indexer run');
      return false;
    }

    this.indexing = true;
    this.lastIndexAttempt = Date.now();
    try {
      await this._catchUp();
      let localRoot = this._computeLocalRoot();

      // Mismatch → wipe and re-index from deploy block once. If it still
      // mismatches, give up; the caller surfaces 'root-unavailable'.
      if (!localRoot || localRoot.toLowerCase() !== expectedRoot.toLowerCase()) {
        MERKLE_DEBUG && console.warn('[MerkleTree] root mismatch after catchup, full re-index');
        this.clear();
        this.state.treeDepth = this.treeDepth; // preserve known depth
        await this._catchUp();
        localRoot = this._computeLocalRoot();
      }

      const ok = !!localRoot && localRoot.toLowerCase() === expectedRoot.toLowerCase();
      MERKLE_DEBUG && console.log('[MerkleTree] root match:', ok, 'leaves=', this.state.leaves.length);
      return ok;
    } catch (e) {
      console.warn('[MerkleTree] catchUp failed:', e.message);
      return false;
    } finally {
      this.indexing = false;
    }
  }

  async _waitForIndexer(maxMs) {
    const start = Date.now();
    while (this.indexing && Date.now() - start < maxMs) {
      await new Promise(r => setTimeout(r, 100));
    }
    return !this.indexing;
  }

  async _catchUp() {
    await this._ensureTreeDepth();

    const head = await this._getBlockNumber();
    const startBlock = (this.state.lastBlock !== null
      ? this.state.lastBlock + 1
      : this._deployBlock());

    if (startBlock > head) {
      this.state.lastBlock = head;
      this._saveToStorage();
      return;
    }

    const newEntries = [];
    let cursor = startBlock;
    while (cursor <= head) {
      const to = Math.min(cursor + this.maxLogRange - 1, head);
      const entries = await this._fetchInsertionEvents(cursor, to);
      newEntries.push(...entries);
      cursor = to + 1;
    }

    if (newEntries.length) {
      // Sort by (blockNumber, logIndex) — same ordering the contract uses.
      newEntries.sort((a, b) =>
        a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
      this.state.leaves.push(...newEntries);
      MERKLE_DEBUG && console.log('[MerkleTree] appended', newEntries.length,
        'leaves; total=', this.state.leaves.length);
    }

    this.state.lastBlock = head;
    this._saveToStorage();
  }

  _deployBlock() {
    try {
      const override = localStorage.getItem(`kaisign_registry_deploy_block_${this.registryAddress}`);
      if (override) {
        const n = parseInt(override, 10);
        if (Number.isFinite(n) && n > 0) return n;
      }
    } catch { /* no localStorage */ }
    return this.defaultDeployBlock;
  }

  async _getBlockNumber() {
    const hex = await this._rpc('eth_blockNumber', []);
    return Number(BigInt(hex));
  }

  /**
   * Fetch SpecIndexed and RevokeFinalized(revoked=true) events in [fromBlock, toBlock]
   * and convert each to a leaf entry by reading metadataHash via getAttestation.
   */
  async _fetchInsertionEvents(fromBlock, toBlock) {
    const specTopic = _topic('SpecIndexed(bytes32,uint256,bytes32,bytes32,address)');
    const revokeTopic = _topic('RevokeFinalized(bytes32,bool)');
    if (!specTopic || !revokeTopic) {
      throw new Error('event topic hashes unavailable');
    }

    // Two separate eth_getLogs because some RPCs choke on OR'd topic arrays.
    // The merge step re-establishes (block, logIndex) ordering anyway.
    const fromHex = '0x' + fromBlock.toString(16);
    const toHex = '0x' + toBlock.toString(16);

    const [specLogs, revokeLogs] = await Promise.all([
      this._rpc('eth_getLogs', [{
        address: this.registryAddress,
        fromBlock: fromHex,
        toBlock: toHex,
        topics: [specTopic]
      }]),
      this._rpc('eth_getLogs', [{
        address: this.registryAddress,
        fromBlock: fromHex,
        toBlock: toHex,
        topics: [revokeTopic]
      }])
    ]);

    const entries = [];

    // SpecIndexed → availability leaf (revoked=false)
    for (const log of (specLogs || [])) {
      // topics[1]=uid, topics[2]=chainId, topics[3]=extcodehash; data has blobHash + attester
      const uid = log.topics[1];
      const att = await this._getAttestation(uid);
      if (!att) continue;
      const leaf = this._computeLeaf(att.chainId, att.extcodehash, att.metadataHash, false);
      entries.push({
        leaf,
        uid,
        kind: 'availability',
        blockNumber: parseInt(log.blockNumber, 16),
        logIndex: parseInt(log.logIndex, 16)
      });
    }

    // RevokeFinalized(uid, true) → revocation leaf (revoked=true). The bool is
    // in the unindexed `data` field; only revoked=true triggers an insertion
    // (KaiSignRegistry.sol:500-520). ABI-encodes true as a left-padded 32-byte
    // word with the low bit set.
    for (const log of (revokeLogs || [])) {
      const dataHex = log.data || '0x';
      let isTrue = false;
      try { isTrue = BigInt(dataHex) === 1n; } catch { /* malformed log */ }
      if (!isTrue) continue;
      const uid = log.topics[1];
      const att = await this._getAttestation(uid);
      if (!att) continue;
      const leaf = this._computeLeaf(att.chainId, att.extcodehash, att.metadataHash, true);
      entries.push({
        leaf,
        uid,
        kind: 'revocation',
        blockNumber: parseInt(log.blockNumber, 16),
        logIndex: parseInt(log.logIndex, 16)
      });
    }

    return entries;
  }

  /**
   * Read getAttestation(uid) and pluck the three fields we need.
   * Attestation layout (IKaiSignRegistry.sol:11-24):
   *   uid bytes32, chainId uint256, extcodehash bytes32, blobHash bytes32,
   *   metadataHash bytes32, attester address, timestamp uint64, revoked bool,
   *   finalizedAt uint64, revokeProposedAt uint64, revokeProposer address,
   *   revokeAttempt uint32
   * As a static struct, ABI returns it as 12 packed 32-byte words.
   */
  async _getAttestation(uid) {
    const verifier = this._resolveVerifier();
    const selector = verifier.selectors.getAttestation;
    if (!selector) throw new Error('getAttestation selector unavailable');
    const calldata = selector + verifier._encodeBytes32(uid);
    const result = await this._ethCall(calldata);
    if (!result || result === '0x' || result.length < 2 + 12 * 64) {
      return null;
    }
    const hex = result.slice(2);
    const word = i => '0x' + hex.slice(i * 64, (i + 1) * 64);
    return {
      // uid: word(0)
      chainId: BigInt(word(1)),
      extcodehash: word(2),
      // blobHash: word(3)
      metadataHash: word(4)
      // remaining fields not needed for leaf reconstruction
    };
  }

  /**
   * Compute leaf hash via the verifier's helper so the encoding stays in one
   * place. (Just a thin wrapper — keeps merkle-tree.js from re-implementing
   * the abi.encode layout.)
   */
  _computeLeaf(chainId, extcodehash, metadataHash, revoked) {
    return this._resolveVerifier().computeLeafHash({
      chainId, extcodehash, metadataHash, revoked
    });
  }
}

// Wire up after the verifier is loaded.
function _initMerkleTree() {
  if (window.onChainVerifier) {
    const tree = new KaiSignMerkleTree({
      registryAddress: window.onChainVerifier.registryAddress
    });
    window.kaisignMerkleTree = tree;
    window.clearMerkleTreeCache = () => tree.clear();
    console.log('[KaiSign] Merkle tree indexer ready');
  } else {
    setTimeout(_initMerkleTree, 100);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _initMerkleTree);
} else {
  _initMerkleTree();
}

} // End of duplicate-load guard
