/**
 * PancakeSwap V3 Smart Router Tests
 *
 * Tests the (uint256, bytes[]) multicall variant — PancakeSwap uses
 * deadline + data pattern (selector 0x5ae401dc), different from
 * SushiSwap's bytes[]-only multicall (0xac9650d8).
 *
 * Also tests per-contract metadata resolution: same selector 0x04e45aaf
 * should resolve to PancakeSwap metadata (not SushiSwap).
 */

import { ethers } from 'ethers';
import { CONTRACTS } from '../../config.js';
import { loadMetadata } from '../../lib/metadata-loader.js';

export async function runTests(harness) {
  const results = [];

  const routerAddress = CONTRACTS.dex.pancakeSwapSmartRouterV3.address.toLowerCase();
  harness.addMetadata(routerAddress, loadMetadata('protocols/pancakeswap-smart-router-v3.json'));

  const exactInputSingleIface = new ethers.Interface([
    'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96))'
  ]);

  // Test 1: exactInputSingle — same selector as SushiSwap but different contract
  const exactInputSingleCalldata = exactInputSingleIface.encodeFunctionData('exactInputSingle', [{
    tokenIn: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    tokenOut: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    fee: 2500,
    recipient: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
    amountIn: ethers.parseEther('0.5'),
    amountOutMinimum: 1200000000n,
    sqrtPriceLimitX96: 0n
  }]);

  results.push(await harness.runTest({
    name: 'PancakeSwap V3 exactInputSingle (same selector as SushiSwap)',
    calldata: exactInputSingleCalldata,
    contractAddress: routerAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x04e45aaf',
      functionName: 'exactInputSingle',
      intentContains: 'PancakeSwap'
    }
  }));

  // Test 2: exactInput (multi-hop)
  const exactInputIface = new ethers.Interface([
    'function exactInput((bytes path, address recipient, uint256 amountIn, uint256 amountOutMinimum))'
  ]);

  const path = ethers.concat([
    '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    ethers.toBeHex(2500, 3),
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
  ]);

  const exactInputCalldata = exactInputIface.encodeFunctionData('exactInput', [{
    path: path,
    recipient: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
    amountIn: ethers.parseEther('1'),
    amountOutMinimum: 2400000000n
  }]);

  results.push(await harness.runTest({
    name: 'PancakeSwap V3 exactInput',
    calldata: exactInputCalldata,
    contractAddress: routerAddress,
    expected: {
      shouldSucceed: true,
      selector: '0xb858183f',
      functionName: 'exactInput',
      intentContains: 'PancakeSwap'
    }
  }));

  // Test 3: multicall with deadline — (uint256, bytes[]) variant
  const multicallIface = new ethers.Interface([
    'function multicall(uint256 deadline, bytes[] data)'
  ]);

  const multicallCalldata = multicallIface.encodeFunctionData('multicall', [
    1735689600n, // deadline timestamp
    [exactInputSingleCalldata]
  ]);

  results.push(await harness.runTest({
    name: 'PancakeSwap V3 multicall with deadline (uint256, bytes[])',
    calldata: multicallCalldata,
    contractAddress: routerAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x5ae401dc',
      functionName: 'multicall',
      intentContains: 'PancakeSwap'
    }
  }));

  return results;
}
