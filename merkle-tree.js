/**
 * merkle-tree.js — Local proof generator over a bundled leaf set
 *
 * Why this file exists
 *   The KaiSignRegistry contract uses an incremental Merkle tree
 *   (KaiSignRegistry.sol:576-590). Off-chain proof generation requires the
 *   full tree — the contract only stores `filledSubtrees` (just enough for
 *   the next root, not for arbitrary historical proofs). So we ship a
 *   bundled snapshot of the leaves in `merkle-seed.js` and rebuild the
 *   tree client-side using the same algorithm.
 *
 * What this file deliberately does NOT do
 *   - No RPC. No `eth_getLogs`, no `eth_call`. Not even one. The verifier
 *     fetches `merkleRoot()` once per session; that is the *only* network
 *     call in the whole verification stack.
 *   - No catch-up. No live indexing. The seed is the universe.
 *   - No localStorage state. No mutex. No backoff. Nothing dynamic.
 *
 * Authority
 *   The contract's `merkleRoot()` (queried by the verifier) is the only
 *   root that ever enters comparisons. This file does not produce, store,
 *   or compare any root of its own. It only emits proofs for leaves the
 *   seed contains; the verifier checks each proof against the on-chain
 *   root and decides verified / revoked / unattested from the result.
 *
 * Seed staleness is not handled here
 *   If the seed is older than the live registry, every contract attested
 *   after the seed-bake date will fail off-chain proof verification under
 *   the live root. That is a build/release concern: re-bake the seed.
 *   Surfacing it to the user (if needed) is the verifier's job, not this
 *   file's.
 *
 * Public surface (read by onchain-verifier.js)
 *   window.kaisignMerkleTree.proveLeaf(leafHash) -> {proof: string[], index: number} | null
 *   window.kaisignMerkleTree.stats() -> {leafCount}
 */

if (window.kaisignMerkleTree) {
  console.log('[KaiSign] Merkle tree already loaded, skipping');
} else {

console.log('[KaiSign] Merkle tree loading...');

// Hardcoded from the deployed registry constructor argument
// (v1-core/script/DeployAll.s.sol:35). The contract uses `treeDepth` as an
// immutable, set once at deployment to 20. If the registry is ever
// re-deployed with a different depth, change this constant in lockstep
// with re-baking merkle-seed.js.
const TREE_DEPTH = 20;

class KaiSignMerkleTree {
  constructor() {
    const seed = (typeof window !== 'undefined') ? window.__KAISIGN_MERKLE_SEED : null;
    const seedLeaves = (seed && Array.isArray(seed.leaves)) ? seed.leaves : [];

    // Normalize: lowercase, validate shape. Anything malformed gets dropped
    // loudly — the seed is a build artifact, not user input.
    this.leaves = [];
    for (let i = 0; i < seedLeaves.length; i++) {
      const v = seedLeaves[i];
      if (typeof v !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(v)) {
        console.log('[MerkleTree] dropping malformed seed leaf at', i, v);
        continue;
      }
      this.leaves.push(v.toLowerCase());
    }

    // Index for O(1) leaf-presence lookup in proveLeaf.
    this.indexByLeaf = new Map();
    for (let i = 0; i < this.leaves.length; i++) {
      this.indexByLeaf.set(this.leaves[i], i);
    }

    this._buildZeroHashes();

    console.log('[KaiSign] Merkle tree ready, leaves=', this.leaves.length);
  }

  // Mirrors KaiSignRegistry.sol:144-148.
  _buildZeroHashes() {
    const zh = new Array(TREE_DEPTH);
    let z = '0x' + '0'.repeat(64);
    for (let i = 0; i < TREE_DEPTH; i++) {
      zh[i] = z;
      z = this._keccak('0x' + z.slice(2) + z.slice(2));
    }
    this.zeroHashes = zh;
  }

  // Use the verifier's keccak — keeps a single hash implementation in scope
  // and avoids depending on `keccak256Simple` being globally hoisted.
  _keccak(hex) {
    if (typeof window !== 'undefined' && window.onChainVerifier?.keccak256Bytes) {
      return window.onChainVerifier.keccak256Bytes(hex);
    }
    if (typeof window !== 'undefined' && window.ethers?.keccak256) {
      return window.ethers.keccak256(hex);
    }
    throw new Error('No keccak256 available — cannot build merkle tree');
  }

  /**
   * Build the full tree once and emit the per-level Map of (position -> hash).
   * Empty positions inherit from zeroHashes[level], same as the contract.
   */
  _buildLevels() {
    const levels = new Array(TREE_DEPTH + 1);
    levels[0] = new Map();
    for (let i = 0; i < this.leaves.length; i++) {
      levels[0].set(i, this.leaves[i]);
    }
    for (let level = 0; level < TREE_DEPTH; level++) {
      const child = levels[level];
      const parent = new Map();
      const parentPositions = new Set();
      for (const childPos of child.keys()) {
        parentPositions.add(childPos >> 1);
      }
      for (const pPos of parentPositions) {
        const left = child.get(pPos * 2) || this.zeroHashes[level];
        const right = child.get(pPos * 2 + 1) || this.zeroHashes[level];
        parent.set(pPos, this._keccak('0x' + left.slice(2) + right.slice(2)));
      }
      levels[level + 1] = parent;
    }
    return levels;
  }

  /**
   * Generate a merkle proof for a leaf hash.
   * Returns null if the leaf is not in the seed.
   *
   * @param {string} leafHash - bytes32 hex (case-insensitive, 0x-prefixed)
   * @returns {{proof: string[], index: number} | null}
   */
  proveLeaf(leafHash) {
    if (typeof leafHash !== 'string') return null;
    const target = leafHash.toLowerCase();
    const index = this.indexByLeaf.get(target);
    if (index === undefined) return null;

    const levels = this._buildLevels();
    const proof = [];
    let pos = index;
    for (let level = 0; level < TREE_DEPTH; level++) {
      const siblingPos = pos % 2 === 0 ? pos + 1 : pos - 1;
      const sibling = levels[level].get(siblingPos) || this.zeroHashes[level];
      proof.push(sibling);
      pos = pos >> 1;
    }
    return { proof, index };
  }

  stats() {
    return { leafCount: this.leaves.length };
  }
}

const tree = new KaiSignMerkleTree();
window.kaisignMerkleTree = tree;

if (typeof document !== 'undefined' && document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[KaiSign] Merkle tree ready (DOM loaded), leaves=', tree.leaves.length);
  });
}

} // End of duplicate-load guard
