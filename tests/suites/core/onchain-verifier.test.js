/**
 * Live Sepolia On-Chain Verifier Tests
 *
 * This suite is intentionally live-only. It checks the Merkle root exposed by
 * the current Sepolia registry contract and compares it to the expected value
 * observed on April 10, 2026.
 *
 * Run with:
 *   KAISIGN_LIVE_SEPOLIA=1 node run-all-tests.js --suite=onchain-verifier
 */

import { ethers } from 'ethers';

const LIVE_FLAG = process.env.KAISIGN_LIVE_SEPOLIA === '1' || process.argv.includes('--live-sepolia');

const NEW_REGISTRY_ADDRESS = '0xb910E44893713b072ABC6949fB4441ad09999bC6';
const OLD_REGISTRY_ADDRESS = '0xC203e8C22eFCA3C9218a6418f6d4281Cb7744dAa';
const SEPOLIA_RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com';

// Verified from the live Sepolia contract at 2026-04-10.
const EXPECTED_NEW_REGISTRY_MERKLE_ROOT = '0x825ca785e5b5a17f0b735b7408eec432adf9fade8e27eaca0a9d37950177e760';

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

export async function runTests(harness) {
  const results = [];

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
        NEW_REGISTRY_ADDRESS.toLowerCase() === '0xb910e44893713b072abc6949fb4441ad09999bc6',
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
