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

  return results;
}
