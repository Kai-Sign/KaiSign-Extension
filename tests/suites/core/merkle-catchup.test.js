/**
 * Merkle seed / proof tests
 *
 * The current shipped merkle-tree is intentionally seed-only:
 *   - no RPC
 *   - no catch-up
 *   - no mutable state beyond the bundled leaf set
 *
 * This suite pins the invariants that still matter for the live verifier:
 *   (P1) the bundled seed loads and indexes the expected number of leaves
 *   (P2) a proof for a seeded leaf verifies against the locally rebuilt root
 *   (P3) a known production availability leaf that arrived after the seed bake
 *        is absent from the seed
 *   (P4) the topic hashes used elsewhere in the verification stack still match
 *        canonical event signatures
 */

import { ethers } from 'ethers';
import { loadMerkleStack } from '../../lib/node-adapter.js';

const SEED_REGISTRY = '0x122d1ad78fdda6829f104cb8cbb56e5561e56ba8';
const SEED_LEAF_COUNT = 788;
const EXPORT_AVAILABILITY_LEAF_TX1 = '0xbe54c9ccb95cdbb64a7c9c4bf4b738e127d13fae4b8a0facc71577e300831578';

function pushResult(harness, results, name, passed, intent, error = null) {
  results.push(harness.createResult(
    name,
    passed,
    { success: passed, intent },
    {},
    error,
    0
  ));
}

export async function runTests(harness) {
  const results = [];

  // ---- (P1) Seed bootstrap loads expected leaf set ------------------------
  {
    const { tree, verifier } = loadMerkleStack({ withSeed: true });
    const uniqueLeafCount = new Set(tree.leaves).size;
    const passed = Array.isArray(tree.leaves)
      && tree.leaves.length === SEED_LEAF_COUNT
      && tree.stats().leafCount === SEED_LEAF_COUNT
      && tree.indexByLeaf instanceof Map
      && tree.indexByLeaf.size === uniqueLeafCount
      && verifier.registryAddress === SEED_REGISTRY;

    pushResult(harness, results,
      'P1: bundled seed loads and indexes the expected leaf set',
      passed,
      passed
        ? `leafCount=${tree.leaves.length}, uniqueLeafCount=${uniqueLeafCount}, registry=${SEED_REGISTRY.slice(0, 14)}…`
        : `MISMATCH: leaves=${tree.leaves?.length} stats=${JSON.stringify(tree.stats?.())}`
    );
  }

  // ---- (P2) Proof for a seeded leaf verifies against the rebuilt root -----
  {
    const { tree, verifier } = loadMerkleStack({ withSeed: true });
    const seedLeaf = tree.leaves[0];
    const proof = tree.proveLeaf(seedLeaf);
    const levels = tree._buildLevels();
    const depth = tree.zeroHashes.length;
    const root = levels[depth].get(0) || tree.zeroHashes[depth - 1];
    const proofVerifies = proof
      ? verifier._verifyMerkleProofOffChain(seedLeaf, proof.proof, proof.index, root)
      : false;
    const caseInsensitiveProof = tree.proveLeaf(seedLeaf.toUpperCase());

    const passed = !!proof
      && proof.index === tree.indexByLeaf.get(seedLeaf)
      && proof.proof.length === depth
      && proofVerifies
      && !!caseInsensitiveProof
      && caseInsensitiveProof.index === proof.index;

    pushResult(harness, results,
      'P2: seeded leaf proof verifies against the locally rebuilt root',
      passed,
      passed
        ? `proofLen=${proof.proof.length}, root=${root.slice(0, 14)}…, case-insensitive lookup preserved`
        : `FAIL proof=${!!proof} verify=${proofVerifies} depth=${depth}`
    );
  }

  // ---- (P3) Production export's availabilityLeaf is absent from the seed --
  {
    const { tree } = loadMerkleStack({ withSeed: true });
    const proof = tree.proveLeaf(EXPORT_AVAILABILITY_LEAF_TX1);
    const passed = proof === null;
    pushResult(harness, results,
      'P3: export availabilityLeaf is not in the bundled seed',
      passed,
      passed
        ? `leaf ${EXPORT_AVAILABILITY_LEAF_TX1.slice(0, 14)}… is absent, so stale-seed verification would show unattested`
        : 'UNEXPECTED: export leaf is present in the current bundled seed'
    );
  }

  // ---- (P4) Topic hashes still match canonical event signatures ----------
  {
    const expectedSpecTopic = ethers.id('SpecIndexed(bytes32,uint256,bytes32,bytes32,address)');
    const expectedRevokeTopic = ethers.id('RevokeFinalized(bytes32,bool)');

    // Reach into the indexer's _topic helper via globalThis (decode.js + the
    // shim we install put keccak256Simple on global). This proves the indexer
    // would compute the same topic0 we just derived from ethers.
    const indexerSpecTopic = globalThis.keccak256Simple(
      'SpecIndexed(bytes32,uint256,bytes32,bytes32,address)'
    );
    const indexerRevokeTopic = globalThis.keccak256Simple('RevokeFinalized(bytes32,bool)');

    const passed = indexerSpecTopic.toLowerCase() === expectedSpecTopic.toLowerCase()
      && indexerRevokeTopic.toLowerCase() === expectedRevokeTopic.toLowerCase();

    pushResult(harness, results,
      'P4: indexer topic0 hashes match canonical event signatures',
      passed,
      passed
        ? `spec=${expectedSpecTopic.slice(0, 14)}… revoke=${expectedRevokeTopic.slice(0, 14)}… match`
        : `MISMATCH spec ${indexerSpecTopic} vs ${expectedSpecTopic}, revoke ${indexerRevokeTopic} vs ${expectedRevokeTopic}`
    );
  }

  return results;
}
