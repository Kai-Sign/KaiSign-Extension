/**
 * Lido Protocol Tests
 */

import { CONTRACTS } from '../../config.js';

export async function runTests(harness) {
  const results = [];

  const stETHAddress = CONTRACTS.staking.lidoStETH.address.toLowerCase();

  harness.addMetadata(stETHAddress, {
    context: {
      contract: {
        address: stETHAddress,
        chainId: 1,
        name: 'Lido stETH',
        abi: [
          { type: 'function', name: 'submit', selector: '0xa1903eab', inputs: [{ name: '_referral', type: 'address' }] }
        ]
      }
    },
    display: {
      formats: {
        'submit(address)': { intent: 'Stake ETH with Lido', fields: [{ path: '_referral', label: 'Referral', format: 'address' }] }
      }
    }
  });

  results.push(await harness.runTest({
    name: 'Lido submit (stake ETH)',
    calldata: '0xa1903eab' +
      '0000000000000000000000000000000000000000000000000000000000000000',
    contractAddress: stETHAddress,
    expected: { shouldSucceed: true, selector: '0xa1903eab', functionName: 'submit', intentContains: 'Stake' }
  }));

  const wstETHAddress = CONTRACTS.staking.lidoWstETH.address.toLowerCase();

  harness.addMetadata(wstETHAddress, {
    context: {
      contract: {
        address: wstETHAddress,
        chainId: 1,
        name: 'Lido wstETH',
        abi: [
          { type: 'function', name: 'wrap', selector: '0xea598cb0', inputs: [{ name: '_stETHAmount', type: 'uint256' }] },
          { type: 'function', name: 'unwrap', selector: '0xde0e9a3e', inputs: [{ name: '_wstETHAmount', type: 'uint256' }] }
        ]
      }
    },
    display: {
      formats: {
        'wrap(uint256)': {
          intent: 'Wrap {_stETHAmount} to wstETH',
          fields: [
            { path: '_stETHAmount', label: 'Amount', format: 'amount', params: { decimals: 18, symbol: 'stETH' } }
          ]
        },
        'unwrap(uint256)': {
          intent: 'Unwrap {_wstETHAmount} wstETH to stETH',
          fields: [
            { path: '_wstETHAmount', label: 'Amount', format: 'amount', params: { decimals: 18, symbol: 'wstETH' } }
          ]
        }
      }
    }
  });

  results.push(await harness.runTest({
    name: 'Lido wrap stETH',
    calldata: '0xea598cb0' +
      '0000000000000000000000000000000000000000000000000de0b6b3a7640000',
    contractAddress: wstETHAddress,
    expected: { shouldSucceed: true, selector: '0xea598cb0', functionName: 'wrap', intentContains: 'Wrap' }
  }));

  return results;
}
