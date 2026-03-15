/**
 * Lido Protocol Tests
 */

import { CONTRACTS } from '../../config.js';
import { loadMetadata } from '../../lib/metadata-loader.js';

export async function runTests(harness) {
  const results = [];

  const stETHAddress = CONTRACTS.staking.lidoStETH.address.toLowerCase();
  harness.addMetadata(stETHAddress, loadMetadata('protocols/lido-steth.json'));

  results.push(await harness.runTest({
    name: 'Lido submit (stake ETH)',
    calldata: '0xa1903eab' +
      '0000000000000000000000000000000000000000000000000000000000000000',
    contractAddress: stETHAddress,
    expected: {
      shouldSucceed: true,
      selector: '0xa1903eab',
      functionName: 'submit',
      intent: 'Stake ETH with Lido',
      intentContains: 'Stake'
    }
  }));

  const wstETHAddress = CONTRACTS.staking.lidoWstETH.address.toLowerCase();
  harness.addMetadata(wstETHAddress, loadMetadata('protocols/lido-wsteth.json'));

  results.push(await harness.runTest({
    name: 'Lido wrap stETH',
    calldata: '0xea598cb0' +
      '0000000000000000000000000000000000000000000000000de0b6b3a7640000',
    contractAddress: wstETHAddress,
    expected: {
      shouldSucceed: true,
      selector: '0xea598cb0',
      functionName: 'wrap',
      intent: 'Wrap 1.00 stETH to wstETH',
      intentContains: '1.00'
    }
  }));

  // --- Lido Withdrawal Queue ---
  const withdrawalQueueAddress = CONTRACTS.staking.lidoWithdrawalQueue.address.toLowerCase();
  harness.addMetadata(withdrawalQueueAddress, loadMetadata('protocols/lido-withdrawal-queue.json'));

  // Test 3: requestWithdrawals(uint256[] _amounts, address _owner) — dynamic array
  // Encode: selector + offset to _amounts array + _owner address + array length + array elements
  results.push(await harness.runTest({
    name: 'Lido requestWithdrawals (dynamic uint256[] array)',
    calldata: '0xd6681042' +
      '0000000000000000000000000000000000000000000000000000000000000040' + // offset to _amounts
      '000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045' + // _owner
      '0000000000000000000000000000000000000000000000000000000000000002' + // array length = 2
      '0000000000000000000000000000000000000000000000000de0b6b3a7640000' + // 1 ETH
      '0000000000000000000000000000000000000000000000001bc16d674ec80000',  // 2 ETH
    contractAddress: withdrawalQueueAddress,
    expected: {
      shouldSucceed: true,
      selector: '0xd6681042',
      functionName: 'requestWithdrawals',
      intentContains: 'Lido'
    }
  }));

  // Test 4: claimWithdrawal(uint256 _requestId)
  results.push(await harness.runTest({
    name: 'Lido claimWithdrawal',
    calldata: '0xf8444436' +
      '0000000000000000000000000000000000000000000000000000000000000042',  // requestId = 66
    contractAddress: withdrawalQueueAddress,
    expected: {
      shouldSucceed: true,
      selector: '0xf8444436',
      functionName: 'claimWithdrawal',
      intentContains: 'Lido'
    }
  }));

  return results;
}
