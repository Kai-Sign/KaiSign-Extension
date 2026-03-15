/**
 * Balancer V2 Protocol Tests
 *
 * Tests multi-tuple parameter decoding: swap takes (tuple, tuple, uint256, uint256)
 * — two complex tuples side-by-side in one function call.
 */

import { ethers } from 'ethers';
import { CONTRACTS } from '../../config.js';
import { loadMetadata } from '../../lib/metadata-loader.js';

export async function runTests(harness) {
  const results = [];

  const vaultAddress = CONTRACTS.dex.balancerVaultV2.address.toLowerCase();
  harness.addMetadata(vaultAddress, loadMetadata('protocols/balancer-vault-v2.json'));

  // Test 1: Balancer swap — two tuples (singleSwap, funds) + limit + deadline
  const swapIface = new ethers.Interface([
    'function swap((bytes32 poolId, uint8 kind, address assetIn, address assetOut, uint256 amount, bytes userData), (address sender, bool fromInternalBalance, address recipient, bool toInternalBalance), uint256 limit, uint256 deadline)'
  ]);

  const swapCalldata = swapIface.encodeFunctionData('swap', [
    {
      poolId: '0x5c6ee304399dbdb9c8ef030ab642b10820db8f56000200000000000000000014',
      kind: 0, // GIVEN_IN
      assetIn: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',  // WETH
      assetOut: '0xba100000625a3754423978a60c9317c58a424e3D', // BAL
      amount: ethers.parseEther('1'),
      userData: '0x'
    },
    {
      sender: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
      fromInternalBalance: false,
      recipient: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
      toInternalBalance: false
    },
    0n, // limit
    1735689600n // deadline
  ]);

  results.push(await harness.runTest({
    name: 'Balancer V2 swap (multi-tuple params)',
    calldata: swapCalldata,
    contractAddress: vaultAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x52bbbe29',
      functionName: 'swap',
      intentContains: 'Balancer'
    }
  }));

  // Test 2: Balancer joinPool
  const joinIface = new ethers.Interface([
    'function joinPool(bytes32 poolId, address sender, address recipient, (address[] assets, uint256[] maxAmountsIn, bytes userData, bool fromInternalBalance) request)'
  ]);

  const joinCalldata = joinIface.encodeFunctionData('joinPool', [
    '0x5c6ee304399dbdb9c8ef030ab642b10820db8f56000200000000000000000014',
    '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
    '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
    {
      assets: [
        '0xba100000625a3754423978a60c9317c58a424e3D',
        '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
      ],
      maxAmountsIn: [ethers.parseEther('100'), ethers.parseEther('1')],
      userData: '0x',
      fromInternalBalance: false
    }
  ]);

  results.push(await harness.runTest({
    name: 'Balancer V2 joinPool',
    calldata: joinCalldata,
    contractAddress: vaultAddress,
    expected: {
      shouldSucceed: true,
      selector: '0xb95cac28',
      functionName: 'joinPool',
      intentContains: 'Balancer'
    }
  }));

  // Test 3: Balancer exitPool
  const exitIface = new ethers.Interface([
    'function exitPool(bytes32 poolId, address sender, address recipient, (address[] assets, uint256[] minAmountsOut, bytes userData, bool toInternalBalance) request)'
  ]);

  const exitCalldata = exitIface.encodeFunctionData('exitPool', [
    '0x5c6ee304399dbdb9c8ef030ab642b10820db8f56000200000000000000000014',
    '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
    '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
    {
      assets: [
        '0xba100000625a3754423978a60c9317c58a424e3D',
        '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
      ],
      minAmountsOut: [0n, 0n],
      userData: '0x',
      toInternalBalance: false
    }
  ]);

  results.push(await harness.runTest({
    name: 'Balancer V2 exitPool',
    calldata: exitCalldata,
    contractAddress: vaultAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x8bdb3913',
      functionName: 'exitPool',
      intentContains: 'Balancer'
    }
  }));

  return results;
}
