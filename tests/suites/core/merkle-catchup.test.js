/**
 * Merkle catch-up tests (Bug A diagnosis)
 *
 * The production export kaisign-export-1777280840473.json shows every
 * successful decode reporting verified=false / source=root-unavailable
 * with the same registry address (0x122d1ad7…) and the same on-chain
 * merkle root (0x38a692…). The bundled merkle-seed.js is frozen at
 * currentIdx=788 / merkleRoot=0x5ec919…, so reaching the live root
 * requires successful RPC catch-up of the leaves between the seed and
 * the registry's current state.
 *
 * These tests pin the offline pieces of that pipeline so we can
 * distinguish three candidate root causes of the production failure:
 *
 *   (P1) Seed-bootstrap correctness — does the bundled seed produce
 *        the seed-root it claims?
 *   (P2) Leaf-ingest + tree-build correctness — when synthetic
 *        SpecIndexed events arrive, do they land in the tree at the
 *        right positions and produce a matching local root?
 *   (P3) Empty-catch-up failure mode — when RPC returns no logs and
 *        the local root doesn't match, does ensureRootMatches
 *        return false (so onchain-verifier surfaces root-unavailable
 *        honestly) or does it silently succeed?
 *
 * If all three pass here, the production bug must be in the live RPC
 * layer (no logs reaching the bridge, or events filtered out) or in
 * a stale seed that hasn't been re-baked since the registry advanced.
 */

import { ethers } from 'ethers';
import { loadMerkleStack } from '../../lib/node-adapter.js';

const SEED_REGISTRY = '0x122d1ad78fdda6829f104cb8cbb56e5561e56ba8';
const SEED_ROOT = '0x5ec9195200d3784a0ed64151b589e939b0dabfcf16ea9c91def835b5373b2693';
const EXPORT_ON_CHAIN_ROOT = '0x38a692d68d17210a677152785d91a6d7d4e02dc40da028f83cb1e4aec5e5d1a1';
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

/**
 * Mock RPC that backs the verifier's rpcCall + ethCallSepolia.
 *
 * Tests pre-register:
 *  - eth_blockNumber response (a hex string)
 *  - eth_getLogs results keyed by topic0 (specTopic / revokeTopic)
 *  - getAttestation results keyed by uid (returns 12-word ABI-encoded hex)
 *  - merkleRoot() result (a bytes32 hex)
 */
function makeMockRpc({ headBlock = 11000000, logs = {}, attestations = {}, merkleRoot = null } = {}) {
  let getLogsCalls = 0;
  let ethCallCalls = 0;
  return {
    headBlock,
    logs,
    attestations,
    merkleRoot,
    getLogsCalls: () => getLogsCalls,
    ethCallCalls: () => ethCallCalls,
    rpcCall(method, params) {
      if (method === 'eth_blockNumber') {
        return Promise.resolve('0x' + headBlock.toString(16));
      }
      if (method === 'eth_getLogs') {
        getLogsCalls++;
        const topic0 = params?.[0]?.topics?.[0];
        const matched = logs[topic0] || [];
        return Promise.resolve(matched);
      }
      if (method === 'eth_call') {
        ethCallCalls++;
        const data = params?.[0]?.data || '';
        // Route by selector (first 10 chars).
        if (data.startsWith('0x9c91dd56')) {
          // treeDepth() — return uint256(20)
          return Promise.resolve('0x' + (20).toString(16).padStart(64, '0'));
        }
        if (merkleRoot && data.length === 10) {
          // merkleRoot() and similar zero-arg calls — try the registered root.
          return Promise.resolve(merkleRoot);
        }
        // getAttestation(uid) — uid is the trailing 32 bytes.
        if (data.length === 10 + 64) {
          const uid = '0x' + data.slice(-64);
          const att = attestations[uid.toLowerCase()];
          if (att) return Promise.resolve(att);
        }
        return Promise.resolve('0x');
      }
      return Promise.resolve('0x');
    },
    ethCallSepolia(_address, data) {
      return this.rpcCall('eth_call', [{ data }]);
    },
    keccak256Bytes(hexData) {
      return ethers.keccak256(hexData);
    }
  };
}

/**
 * Compute the treeDepth() selector dynamically so we don't drift if it ever
 * changes. (Currently 0x9c91dd56 — used as a literal in the mock above.)
 */
function selectorOf(signature) {
  return ethers.id(signature).slice(0, 10);
}

/**
 * Encode a 12-word getAttestation result.
 *  word 0: uid (we just echo it)
 *  word 1: chainId (uint256)
 *  word 2: extcodehash (bytes32)
 *  word 3: blobHash (bytes32, ignored by merkle)
 *  word 4: metadataHash (bytes32)
 *  words 5-11: address + bools + timestamps (zeroed)
 */
function encodeAttestation({ uid, chainId, extcodehash, metadataHash }) {
  const hex32 = (v) => {
    if (typeof v === 'bigint') return v.toString(16).padStart(64, '0');
    if (typeof v === 'number') return BigInt(v).toString(16).padStart(64, '0');
    return v.startsWith('0x') ? v.slice(2).padStart(64, '0') : v.padStart(64, '0');
  };
  const z = '0'.repeat(64);
  return '0x' +
    hex32(uid) +
    hex32(chainId) +
    hex32(extcodehash) +
    z + // blobHash
    hex32(metadataHash) +
    z + z + z + z + z + z + z;
}

/**
 * Build a SpecIndexed log entry.
 * Topics: [topic0, uid, chainIdIndexed, extcodehashIndexed]
 * Data:   abi.encode(blobHash, attester) — merkle code only reads topics[1].
 */
function makeSpecLog({ specTopic, uid, blockNumber, logIndex }) {
  return {
    topics: [specTopic, uid, '0x' + '0'.repeat(64), '0x' + '0'.repeat(64)],
    data: '0x' + '0'.repeat(128),
    blockNumber: '0x' + blockNumber.toString(16),
    logIndex: '0x' + logIndex.toString(16)
  };
}

export async function runTests(harness) {
  const results = [];

  // ---- (P1) Seed bootstrap reproduces the seed root -----------------------
  {
    const { tree, verifier } = loadMerkleStack({ withSeed: true });
    const mock = makeMockRpc();
    verifier.rpcCall = mock.rpcCall.bind(mock);
    verifier.ethCallSepolia = mock.ethCallSepolia.bind(mock);

    const passed = tree.state.leaves.length === 788
      && tree.treeDepth === 20
      && tree.stats().root.toLowerCase() === SEED_ROOT.toLowerCase()
      && verifier.registryAddress === SEED_REGISTRY;

    pushResult(harness, results,
      'P1: bundled seed bootstraps tree to its claimed root',
      passed,
      passed
        ? `Seed-only local root matches: ${SEED_ROOT.slice(0, 14)}…`
        : `MISMATCH: leaves=${tree.state.leaves.length} depth=${tree.treeDepth} root=${tree.stats().root}`
    );
  }

  // ---- (P2) Synthetic catch-up appends leaves and rebuilds root correctly -
  {
    const { tree, verifier } = loadMerkleStack({ withSeed: true });

    const specTopic = ethers.id('SpecIndexed(bytes32,uint256,bytes32,bytes32,address)');
    const synthUid = '0x' + 'aa'.repeat(32);
    const synthChainId = 1;
    const synthExtcodehash = '0x' + 'bb'.repeat(32);
    const synthMetadataHash = '0x' + 'cc'.repeat(32);

    // Compute the leaf the verifier will derive from this attestation so we
    // can assert it lands in the tree at position 788.
    const expectedLeaf = verifier.computeLeafHash({
      chainId: synthChainId,
      extcodehash: synthExtcodehash,
      metadataHash: synthMetadataHash,
      revoked: false
    });

    const seedMigrationBlock = tree.state.lastBlock; // 10727645
    const synthBlock = seedMigrationBlock + 100;
    const headBlock = synthBlock + 10;

    const mock = makeMockRpc({
      headBlock,
      logs: {
        [specTopic]: [makeSpecLog({ specTopic, uid: synthUid, blockNumber: synthBlock, logIndex: 0 })],
        [ethers.id('RevokeFinalized(bytes32,bool)')]: []
      },
      attestations: {
        [synthUid.toLowerCase()]: encodeAttestation({
          uid: synthUid,
          chainId: synthChainId,
          extcodehash: synthExtcodehash,
          metadataHash: synthMetadataHash
        })
      }
    });
    verifier.rpcCall = mock.rpcCall.bind(mock);
    verifier.ethCallSepolia = mock.ethCallSepolia.bind(mock);

    // Recompute target root manually after appending the synthetic leaf to
    // the seeded leaf set. We pass that as expectedRoot so ensureRootMatches
    // can succeed offline.
    tree.state.leaves.push({
      leaf: expectedLeaf, kind: 'synthetic-preview',
      blockNumber: synthBlock, logIndex: 0
    });
    const targetRoot = tree.stats().root;
    // Pop it back off — the real catch-up is what we want to exercise.
    tree.state.leaves.pop();

    const ok = await tree.ensureRootMatches(targetRoot);

    const finalLeafCount = tree.state.leaves.length;
    const finalRoot = tree.stats().root;
    const proof = tree.proveLeaf(expectedLeaf);

    let proofVerifies = false;
    if (proof) {
      proofVerifies = verifier._verifyMerkleProofOffChain(
        expectedLeaf, proof.proof, proof.index, targetRoot
      );
    }

    const passed = ok
      && finalLeafCount === 789
      && finalRoot.toLowerCase() === targetRoot.toLowerCase()
      && proof !== null
      && proof.index === 788
      && proofVerifies;

    pushResult(harness, results,
      'P2: synthetic SpecIndexed event lands in tree and proves against new root',
      passed,
      passed
        ? `Catch-up appended leaf @ idx=788, proof verified against new root.`
        : `FAIL ok=${ok} count=${finalLeafCount} proof=${!!proof} verified=${proofVerifies} target=${targetRoot.slice(0,14)} actual=${finalRoot.slice(0,14)}`
    );
  }

  // ---- (P3) Empty catch-up against unreachable target returns false -------
  {
    const { tree, verifier } = loadMerkleStack({ withSeed: true });
    const mock = makeMockRpc({
      headBlock: tree.state.lastBlock + 100,
      logs: {} // no events at all
    });
    verifier.rpcCall = mock.rpcCall.bind(mock);
    verifier.ethCallSepolia = mock.ethCallSepolia.bind(mock);

    const ok = await tree.ensureRootMatches(EXPORT_ON_CHAIN_ROOT);

    // ensureRootMatches now returns true on match or a {ok:false, reason, ...}
    // tag on failure. Anything other than literal `true` is a non-success, but
    // an unreachable target should never silently come back as true.
    const passed = ok !== true && ok && ok.ok === false;

    pushResult(harness, results,
      'P3: empty-RPC catch-up against unreachable root returns reason-tagged failure (not a silent success)',
      passed,
      passed
        ? `ensureRootMatches correctly reports {ok:false, reason:'${ok.reason}'} when catch-up cannot close the gap`
        : `BUG: ensureRootMatches returned ${JSON.stringify(ok)} for an unreachable target root!`
    );
  }

  // ---- (P4) Production export's availabilityLeaf cannot be proved with the
  //          stale seed alone — pins the stale-seed hypothesis ---------------
  {
    const { tree } = loadMerkleStack({ withSeed: true });
    const proof = tree.proveLeaf(EXPORT_AVAILABILITY_LEAF_TX1);
    const passed = proof === null;
    pushResult(harness, results,
      'P4: export availabilityLeaf is NOT in the bundled seed (confirms seed is stale vs production)',
      passed,
      passed
        ? `Export leaf ${EXPORT_AVAILABILITY_LEAF_TX1.slice(0, 14)}… absent from seed → seed must be re-baked or RPC catch-up must run`
        : `UNEXPECTED: export leaf is already in the bundled seed — bug must be elsewhere`
    );
  }

  // ---- (P6) Reason-tagged failures distinguish "no events" from "RPC error" -
  // The whole point of A3 is that the popup can say *why* verification can't
  // complete. Exercise three distinct failure paths and assert the reason tag
  // carried back by ensureRootMatches is the right one for each.
  {
    // Case A: empty scan — RPC works but returns no logs. Expect reason='empty-scan'.
    const emptyStack = loadMerkleStack({ withSeed: true });
    const emptyMock = makeMockRpc({
      headBlock: emptyStack.tree.state.lastBlock + 100,
      logs: {}
    });
    emptyStack.verifier.rpcCall = emptyMock.rpcCall.bind(emptyMock);
    emptyStack.verifier.ethCallSepolia = emptyMock.ethCallSepolia.bind(emptyMock);
    const emptyResult = await emptyStack.tree.ensureRootMatches(EXPORT_ON_CHAIN_ROOT);
    const emptyOk = emptyResult && emptyResult.ok === false && emptyResult.reason === 'empty-scan';

    // Case B: RPC throws. Expect reason='rpc-error'.
    const errStack = loadMerkleStack({ withSeed: true });
    errStack.verifier.rpcCall = () => Promise.reject(new Error('simulated RPC down'));
    errStack.verifier.ethCallSepolia = () => Promise.reject(new Error('simulated RPC down'));
    const errResult = await errStack.tree.ensureRootMatches(EXPORT_ON_CHAIN_ROOT);
    const errOk = errResult && errResult.ok === false && errResult.reason === 'rpc-error';

    // Case C: skipCatchUp manual mode. Expect reason='manual-mode'.
    const manStack = loadMerkleStack({ withSeed: true });
    const manResult = await manStack.tree.ensureRootMatches(EXPORT_ON_CHAIN_ROOT, { skipCatchUp: true });
    const manOk = manResult && manResult.ok === false && manResult.reason === 'manual-mode';

    const passed = emptyOk && errOk && manOk;
    pushResult(harness, results,
      'P6: ensureRootMatches returns distinct reason tags for empty-scan / rpc-error / manual-mode',
      passed,
      passed
        ? 'reasons={empty-scan, rpc-error, manual-mode} surfaced correctly to the verifier'
        : `FAIL empty=${JSON.stringify(emptyResult)} err=${JSON.stringify(errResult)} man=${JSON.stringify(manResult)}`
    );
  }

  // ---- (P5) Topic hashes the indexer computes match canonical event sigs --
  // If these ever drift, every eth_getLogs filter in production silently
  // returns zero entries and we land in the "out of sync" branch forever.
  // Pinning them here means any future signature edit must update this test.
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
      'P5: indexer topic0 hashes match canonical event signatures',
      passed,
      passed
        ? `spec=${expectedSpecTopic.slice(0, 14)}… revoke=${expectedRevokeTopic.slice(0, 14)}… match`
        : `MISMATCH spec ${indexerSpecTopic} vs ${expectedSpecTopic}, revoke ${indexerRevokeTopic} vs ${expectedRevokeTopic}`
    );
  }

  // Sanity: hush an unused-import warning if treeDepth selector ever changes.
  void selectorOf;

  return results;
}
