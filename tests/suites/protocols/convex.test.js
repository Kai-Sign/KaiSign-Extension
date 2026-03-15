/**
 * Convex Finance Protocol Tests
 *
 * Tests two unique decoder patterns:
 * 1. Boolean field handling in Convex Booster deposit (pid, amount, stake)
 * 2. Zero-argument functions: cvxCRV stakeAll() and withdrawAll() — selector-only calldata
 */

import { CONTRACTS } from '../../config.js';
import { loadMetadata } from '../../lib/metadata-loader.js';

export async function runTests(harness) {
  const results = [];

  // --- Convex Booster ---
  const boosterAddress = CONTRACTS.staking.convexBooster.address.toLowerCase();
  harness.addMetadata(boosterAddress, loadMetadata('protocols/convex-booster.json'));

  // Test 1: deposit(uint256 _pid, uint256 _amount, bool _stake)
  results.push(await harness.runTest({
    name: 'Convex Booster deposit (bool param)',
    calldata: '0x43a0d066' +
      '0000000000000000000000000000000000000000000000000000000000000020' + // pid = 32
      '0000000000000000000000000000000000000000000000056bc75e2d63100000' + // amount = 100e18
      '0000000000000000000000000000000000000000000000000000000000000001',  // stake = true
    contractAddress: boosterAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x43a0d066',
      functionName: 'deposit',
      intentContains: 'Convex'
    }
  }));

  // Test 2: depositAll(uint256 _pid, bool _stake)
  results.push(await harness.runTest({
    name: 'Convex Booster depositAll',
    calldata: '0x60759fce' +
      '0000000000000000000000000000000000000000000000000000000000000020' + // pid = 32
      '0000000000000000000000000000000000000000000000000000000000000001',  // stake = true
    contractAddress: boosterAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x60759fce',
      functionName: 'depositAll',
      intentContains: 'Convex'
    }
  }));

  // Test 3: withdraw(uint256 _pid, uint256 _amount)
  results.push(await harness.runTest({
    name: 'Convex Booster withdraw',
    calldata: '0x441a3e70' +
      '0000000000000000000000000000000000000000000000000000000000000020' + // pid = 32
      '0000000000000000000000000000000000000000000000056bc75e2d63100000',  // amount = 100e18
    contractAddress: boosterAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x441a3e70',
      functionName: 'withdraw',
      intentContains: 'Convex'
    }
  }));

  // Test 4: withdrawAll(uint256 _pid)
  results.push(await harness.runTest({
    name: 'Convex Booster withdrawAll',
    calldata: '0x958e2d31' +
      '0000000000000000000000000000000000000000000000000000000000000020',  // pid = 32
    contractAddress: boosterAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x958e2d31',
      functionName: 'withdrawAll',
      intentContains: 'Convex'
    }
  }));

  // --- Convex cvxCRV Staking ---
  const cvxCRVAddress = CONTRACTS.staking.convexCvxCRVStaking.address.toLowerCase();
  harness.addMetadata(cvxCRVAddress, loadMetadata('protocols/convex-cvxcrv-staking.json'));

  // Test 5: stake(uint256 _amount)
  results.push(await harness.runTest({
    name: 'Convex cvxCRV stake',
    calldata: '0xa694fc3a' +
      '0000000000000000000000000000000000000000000000056bc75e2d63100000',  // 100e18
    contractAddress: cvxCRVAddress,
    expected: {
      shouldSucceed: true,
      selector: '0xa694fc3a',
      functionName: 'stake',
      intentContains: 'cvxCRV'
    }
  }));

  // Test 6: withdraw(uint256 _amount)
  results.push(await harness.runTest({
    name: 'Convex cvxCRV withdraw',
    calldata: '0x2e1a7d4d' +
      '0000000000000000000000000000000000000000000000056bc75e2d63100000',  // 100e18
    contractAddress: cvxCRVAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x2e1a7d4d',
      functionName: 'withdraw',
      intentContains: 'cvxCRV'
    }
  }));

  // Test 7: getReward(address _account)
  results.push(await harness.runTest({
    name: 'Convex cvxCRV getReward',
    calldata: '0xc00007b0' +
      '000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045',
    contractAddress: cvxCRVAddress,
    expected: {
      shouldSucceed: true,
      selector: '0xc00007b0',
      functionName: 'getReward',
      intentContains: 'Convex'
    }
  }));

  // Test 8: stakeAll() — zero-argument function (selector-only calldata)
  results.push(await harness.runTest({
    name: 'Convex cvxCRV stakeAll (no-arg function)',
    calldata: '0x8dcb4061',
    contractAddress: cvxCRVAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x8dcb4061',
      functionName: 'stakeAll',
      intentContains: 'cvxCRV'
    }
  }));

  // Test 9: withdrawAll() — zero-argument function (selector-only calldata)
  results.push(await harness.runTest({
    name: 'Convex cvxCRV withdrawAll (no-arg function)',
    calldata: '0x853828b6',
    contractAddress: cvxCRVAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x853828b6',
      functionName: 'withdrawAll',
      intentContains: 'cvxCRV'
    }
  }));

  return results;
}
