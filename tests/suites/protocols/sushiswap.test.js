/**
 * SushiSwap V3 Router Tests
 *
 * Tests per-contract metadata resolution: SushiSwap uses the same selector
 * 0x04e45aaf as PancakeSwap for exactInputSingle, but should resolve to
 * SushiSwap-specific metadata.
 */

import { ethers } from 'ethers';
import { CONTRACTS } from '../../config.js';
import { loadMetadata } from '../../lib/metadata-loader.js';

export async function runTests(harness) {
  const results = [];

  const routerAddress = CONTRACTS.dex.sushiSwapRouterV3.address.toLowerCase();
  harness.addMetadata(routerAddress, loadMetadata('protocols/sushiswap-router-v3.json'));

  // Test 1: exactInputSingle — same selector as PancakeSwap (0x04e45aaf)
  const iface = new ethers.Interface([
    'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96))'
  ]);

  const exactInputSingleCalldata = iface.encodeFunctionData('exactInputSingle', [{
    tokenIn: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',   // WETH
    tokenOut: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',  // USDC
    fee: 3000,
    recipient: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
    amountIn: ethers.parseEther('1'),
    amountOutMinimum: 2500000000n, // 2500 USDC
    sqrtPriceLimitX96: 0n
  }]);

  results.push(await harness.runTest({
    name: 'SushiSwap V3 exactInputSingle (selector 0x04e45aaf)',
    calldata: exactInputSingleCalldata,
    contractAddress: routerAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x04e45aaf',
      functionName: 'exactInputSingle',
      intentContains: 'SushiSwap'
    }
  }));

  // Test 2: exactInput (multi-hop)
  const exactInputIface = new ethers.Interface([
    'function exactInput((bytes path, address recipient, uint256 amountIn, uint256 amountOutMinimum))'
  ]);

  // Encode a WETH->USDC path: tokenIn(20) + fee(3) + tokenOut(20)
  const path = ethers.concat([
    '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    ethers.toBeHex(3000, 3),
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
  ]);

  const exactInputCalldata = exactInputIface.encodeFunctionData('exactInput', [{
    path: path,
    recipient: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
    amountIn: ethers.parseEther('2'),
    amountOutMinimum: 5000000000n
  }]);

  results.push(await harness.runTest({
    name: 'SushiSwap V3 exactInput (multi-hop)',
    calldata: exactInputCalldata,
    contractAddress: routerAddress,
    expected: {
      shouldSucceed: true,
      selector: '0xb858183f',
      functionName: 'exactInput',
      intentContains: 'SushiSwap'
    }
  }));

  // Test 3: multicall (bytes[])
  const multicallIface = new ethers.Interface([
    'function multicall(bytes[] data)'
  ]);

  const multicallCalldata = multicallIface.encodeFunctionData('multicall', [
    [exactInputSingleCalldata]
  ]);

  results.push(await harness.runTest({
    name: 'SushiSwap V3 multicall',
    calldata: multicallCalldata,
    contractAddress: routerAddress,
    expected: {
      shouldSucceed: true,
      selector: '0xac9650d8',
      functionName: 'multicall',
      intentContains: 'SushiSwap'
    }
  }));

  return results;
}
