/**
 * Aerodrome Router Tests (Base chain)
 *
 * Tests Base chain (chainId 8453) metadata resolution.
 */

import { ethers } from 'ethers';
import { loadMetadata } from '../../lib/metadata-loader.js';

export async function runTests(harness) {
  const results = [];

  const routerAddress = '0x6Df1c91424f79e40e33b1a48f0687b666be71075'.toLowerCase();
  harness.addMetadata(routerAddress, loadMetadata('protocols/aerodrome-universal-router-base.json'), 8453);

  // Test 1: execute(bytes commands, bytes[] inputs, uint256 deadline)
  // Minimal execute call with a single V2_SWAP_EXACT_IN command (0x08)
  const iface = new ethers.Interface([
    'function execute(bytes commands, bytes[] inputs, uint256 deadline)'
  ]);

  // Build a minimal V2 swap input
  const v2SwapInput = ethers.AbiCoder.defaultAbiCoder().encode(
    ['address', 'uint256', 'uint256', 'address[]', 'bool'],
    [
      '0xd8da6bf26964af9d7eed9e03e53415d37aa96045', // recipient
      ethers.parseEther('0.1'),                        // amountIn
      0n,                                              // amountOutMin
      [
        '0x4200000000000000000000000000000000000006',  // WETH on Base
        '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'   // USDC on Base
      ],
      true // payerIsUser
    ]
  );

  const executeCalldata = iface.encodeFunctionData('execute', [
    '0x08', // V2_SWAP_EXACT_IN command
    [v2SwapInput],
    1735689600n
  ]);

  results.push(await harness.runTest({
    name: 'Aerodrome Router execute on Base (chainId 8453)',
    calldata: executeCalldata,
    contractAddress: routerAddress,
    chainId: 8453,
    expected: {
      shouldSucceed: true,
      selector: '0x3593564c',
      functionName: 'execute'
    }
  }));

  return results;
}
