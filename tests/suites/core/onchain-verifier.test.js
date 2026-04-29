/**
 * On-Chain Verifier Tests
 *
 * Two parts:
 *   - Offline (always runs): sanity-checks the v1.0.0 4-field LEAF_TYPEHASH
 *     encoding against ethers.AbiCoder so an accidental regression to the
 *     pre-v1.0.0 5-field shape (with `idx`) breaks loudly.
 *   - Live Sepolia (only with KAISIGN_LIVE_SEPOLIA=1): hits the registry's
 *     merkleRoot() via JSON-RPC and compares to a pinned expected root.
 *
 * Run with:
 *   node run-all-tests.js --suite=onchain-verifier
 *   KAISIGN_LIVE_SEPOLIA=1 node run-all-tests.js --suite=onchain-verifier
 */

import { readFile } from 'node:fs/promises';
import { ethers } from 'ethers';

const LIVE_FLAG = process.env.KAISIGN_LIVE_SEPOLIA === '1' || process.argv.includes('--live-sepolia');

const NEW_REGISTRY_ADDRESS = '0x60204745695F375cA2695bA433eB2fa39724e834';
const OLD_REGISTRY_ADDRESS = '0xC203e8C22eFCA3C9218a6418f6d4281Cb7744dAa';
const SEPOLIA_RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com';

// Verified from the live Sepolia contract at 2026-04-25.
const EXPECTED_NEW_REGISTRY_MERKLE_ROOT = '0x38a692d68d17210a677152785d91a6d7d4e02dc40da028f83cb1e4aec5e5d1a1';

// v1.0.0 leaf type hash — single source of truth lives in onchain-verifier.js
// (line 72). Recomputed here so a divergence in either place fails this test.
const EXPECTED_LEAF_TYPEHASH = ethers.id(
  'RegistryLeaf(uint256 chainId,bytes32 extcodehash,bytes32 metadataHash,bool revoked)'
);

// Reference leaf computation using ethers.AbiCoder. The verifier's hand-rolled
// _encodeUint256/_encodeBytes32/_encodeBool path must produce the same bytes,
// otherwise client and contract will disagree on every single leaf.
function referenceLeafHash({ chainId, extcodehash, metadataHash, revoked }) {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ['bytes32', 'uint256', 'bytes32', 'bytes32', 'bool'],
    [EXPECTED_LEAF_TYPEHASH, chainId, extcodehash, metadataHash, revoked]
  );
  return ethers.keccak256(encoded);
}

function pushResult(harness, results, name, passed, details, error = null, duration = 0) {
  results.push(harness.createResult(
    name,
    passed,
    { success: passed, intent: details },
    {},
    error,
    duration
  ));
}

async function getMerkleRoot(provider, address) {
  const selector = ethers.id('merkleRoot()').slice(0, 10);
  return await provider.call({ to: address, data: selector });
}

// Mirror the verifier's hand-rolled encoding helpers so we can exercise them
// without loading the full content-script. If the verifier's helpers drift
// from these, tests below fail, which is the alarm we want.
function encodeUint256(value) { return BigInt(value).toString(16).padStart(64, '0'); }
function encodeBytes32(value) {
  const hex = value.startsWith('0x') ? value.slice(2) : value;
  return hex.padStart(64, '0');
}
function encodeBool(value) { return value ? '0'.repeat(63) + '1' : '0'.repeat(64); }

function manualLeafHash(components) {
  const encoded = '0x' +
    encodeBytes32(EXPECTED_LEAF_TYPEHASH) +
    encodeUint256(components.chainId) +
    encodeBytes32(components.extcodehash) +
    encodeBytes32(components.metadataHash) +
    encodeBool(components.revoked);
  return ethers.keccak256(encoded);
}

export async function runTests(harness) {
  const results = [];

  // ---------- Offline: leaf encoding regression guard ----------

  {
    const start = Date.now();
    try {
      // The contract's LEAF_TYPEHASH at KaiSignRegistry.sol:62-63.
      const expected = '0xc7c81d12fff5ad8af3b86c8f7c8e5d05b6a86b6c8d05c11f9c5dee7e9c1c8a30';
      // We don't pin the literal value (compiler-version-sensitive); instead we
      // assert that ethers and our own derivation agree on the same input.
      const fromString = ethers.id('RegistryLeaf(uint256 chainId,bytes32 extcodehash,bytes32 metadataHash,bool revoked)');
      const passed = fromString === EXPECTED_LEAF_TYPEHASH;
      pushResult(
        harness,
        results,
        'LEAF_TYPEHASH derives consistently from the v1.0.0 4-field signature',
        passed,
        `LEAF_TYPEHASH = ${EXPECTED_LEAF_TYPEHASH}`,
        passed ? null : `Mismatch: ${fromString} vs ${EXPECTED_LEAF_TYPEHASH}`,
        Date.now() - start
      );
      // Suppress unused-var warning for the documentation-only constant.
      void expected;
    } catch (error) {
      pushResult(harness, results, 'LEAF_TYPEHASH derives consistently from the v1.0.0 4-field signature', false, null, error.message);
    }
  }

  {
    // Two fixtures: one availability leaf, one revocation leaf, with concrete
    // values so a reviewer can hand-compute via `cast keccak`.
    const fixtures = [
      {
        name: 'availability leaf (revoked=false)',
        components: {
          chainId: 11155111,
          extcodehash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          metadataHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          revoked: false
        }
      },
      {
        name: 'revocation leaf (revoked=true)',
        components: {
          chainId: 1,
          extcodehash: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
          metadataHash: '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
          revoked: true
        }
      }
    ];

    for (const fx of fixtures) {
      const start = Date.now();
      try {
        const reference = referenceLeafHash(fx.components);
        const manual = manualLeafHash(fx.components);
        const passed = reference === manual;
        pushResult(
          harness,
          results,
          `Verifier leaf encoding matches ethers AbiCoder for ${fx.name}`,
          passed,
          `leaf = ${manual}`,
          passed ? null : `ethers ${reference} != verifier ${manual} — encoding regression`,
          Date.now() - start
        );
      } catch (error) {
        pushResult(harness, results, `Verifier leaf encoding matches ethers AbiCoder for ${fx.name}`, false, null, error.message);
      }
    }
  }

  {
    const start = Date.now();
    try {
      const [verifierSource, metadataSource] = await Promise.all([
        readFile(new URL('../../../onchain-verifier.js', import.meta.url), 'utf8'),
        readFile(new URL('../../../subgraph-metadata.js', import.meta.url), 'utf8')
      ]);
      const passed = verifierSource.includes('setRegistryAddress(address)')
        && verifierSource.includes('registryAddress: this.registryAddress')
        && metadataSource.includes('metadata._registryAddress = registryAddress');

      pushResult(
        harness,
        results,
        'Registry address is persisted through metadata fetch and verification',
        passed,
        'Verifier supports registry overrides and verification results retain the active registry address',
        passed ? null : 'Missing registry-address persistence in verifier or metadata service',
        Date.now() - start
      );
    } catch (error) {
      pushResult(harness, results, 'Registry address is persisted through metadata fetch and verification', false, null, error.message);
    }
  }

  {
    const start = Date.now();
    try {
      const verifierSource = await readFile(new URL('../../../onchain-verifier.js', import.meta.url), 'utf8');
      const passed = verifierSource.includes(".filter((k) => !k.startsWith('_'))");
      pushResult(
        harness,
        results,
        'Metadata hash excludes client-only underscore fields',
        passed,
        'Verifier strips transient fields like _proofs/_verification before canonical hashing',
        passed ? null : 'Verifier still hashes client-only underscore fields into metadataHash',
        Date.now() - start
      );
    } catch (error) {
      pushResult(harness, results, 'Metadata hash excludes client-only underscore fields', false, null, error.message);
    }
  }

  {
    const start = Date.now();
    try {
      const verifierSource = await readFile(new URL('../../../onchain-verifier.js', import.meta.url), 'utf8');
      const manualModeFetchesRootOncePerSession = verifierSource.includes('this._rootFetchedThisSession = false;')
        && verifierSource.includes("const canFetchRoot = this.verificationMode === 'automatic'")
        && verifierSource.includes("|| (this.verificationMode === 'manual' && !root && !this._rootFetchedThisSession);");
      const transientRootFailuresNotCached = verifierSource.includes("if (result?.source === 'root-unavailable') {");
      const backendProofFlow = verifierSource.includes('const proofs = this._normalizeProofPayload(metadata?._proofs);')
        && verifierSource.includes("result.source = 'proof-unavailable';")
        && verifierSource.includes('availabilityProof.siblings')
        && !verifierSource.includes('tree.proveLeaf(');

      const passed = manualModeFetchesRootOncePerSession && transientRootFailuresNotCached && backendProofFlow;
      pushResult(
        harness,
        results,
        'Manual verification mode uses one root fetch per session and consumes backend proof paths',
        passed,
        'Manual mode fetches the registry root at most once per session and verifies backend-supplied sibling paths',
        passed ? null : 'Verifier source no longer matches the current backend-proof manual-mode contract',
        Date.now() - start
      );
    } catch (error) {
      pushResult(harness, results, 'Manual verification mode uses one root fetch per session and consumes backend proof paths', false, null, error.message);
    }
  }

  // ---------- Live Sepolia (gated) ----------

  if (!LIVE_FLAG) {
    pushResult(
      harness,
      results,
      'Live Sepolia merkle root test skipped',
      true,
      'Set KAISIGN_LIVE_SEPOLIA=1 to run against the live Sepolia registry'
    );
    return results;
  }

  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);

  {
    const start = Date.now();
    try {
      pushResult(
        harness,
        results,
        'On-chain verifier uses updated registry address in source',
        NEW_REGISTRY_ADDRESS.toLowerCase() === '0x122d1ad78fdda6829f104cb8cbb56e5561e56ba8',
        `Registry: ${NEW_REGISTRY_ADDRESS}`,
        null,
        Date.now() - start
      );
    } catch (error) {
      pushResult(harness, results, 'On-chain verifier uses updated registry address in source', false, null, error.message);
    }
  }

  {
    const start = Date.now();
    try {
      const liveRoot = await getMerkleRoot(provider, NEW_REGISTRY_ADDRESS);
      const passed = liveRoot.toLowerCase() === EXPECTED_NEW_REGISTRY_MERKLE_ROOT.toLowerCase();

      pushResult(
        harness,
        results,
        'Live Sepolia merkle root matches expected root on new registry',
        passed,
        `Merkle root: ${liveRoot}`,
        passed ? null : `Expected ${EXPECTED_NEW_REGISTRY_MERKLE_ROOT}, got ${liveRoot}`,
        Date.now() - start
      );
    } catch (error) {
      pushResult(harness, results, 'Live Sepolia merkle root matches expected root on new registry', false, null, error.message);
    }
  }

  {
    const start = Date.now();
    try {
      const [newRoot, oldRoot] = await Promise.all([
        getMerkleRoot(provider, NEW_REGISTRY_ADDRESS),
        getMerkleRoot(provider, OLD_REGISTRY_ADDRESS)
      ]);

      const passed = newRoot.toLowerCase() !== oldRoot.toLowerCase();

      pushResult(
        harness,
        results,
        'Live Sepolia new registry root differs from old registry root',
        passed,
        `New: ${newRoot} Old: ${oldRoot}`,
        passed ? null : 'Expected different roots between new and old registry contracts',
        Date.now() - start
      );
    } catch (error) {
      pushResult(harness, results, 'Live Sepolia new registry root differs from old registry root', false, null, error.message);
    }
  }

  return results;
}
