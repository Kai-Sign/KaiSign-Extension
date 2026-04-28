/**
 * Token Tests (USDC)
 *
 * Tests ERC-20 token operations with metadata-driven intent formatting:
 * - approve with amount formatting (6 decimals)
 * - transfer
 * - unlimited approval detection (max uint256)
 */

import { loadMetadata } from '../../lib/metadata-loader.js';

export async function runTests(harness) {
  const results = [];

  const usdcAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
  harness.addMetadata(usdcAddress, loadMetadata('tokens/usdc.json'));

  // Test 1: USDC approve with specific amount (100 USDC = 100000000 in 6 decimals)
  results.push(await harness.runTest({
    name: 'USDC approve (6 decimal formatting)',
    calldata: '0x095ea7b3' +
      '000000000000000000000000111111125421ca6dc452d289314280a0f8842a65' + // spender (1inch)
      '0000000000000000000000000000000000000000000000000000000005f5e100',  // 100 USDC
    contractAddress: usdcAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x095ea7b3',
      functionName: 'approve',
      intentContains: 'Approve 100.00 USDC to'
    }
  }));

  // Test 2: USDC transfer
  results.push(await harness.runTest({
    name: 'USDC transfer',
    calldata: '0xa9059cbb' +
      '000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045' + // to
      '00000000000000000000000000000000000000000000000000000000003d0900',  // 4000000 = 4 USDC
    contractAddress: usdcAddress,
    expected: {
      shouldSucceed: true,
      selector: '0xa9059cbb',
      functionName: 'transfer',
      intentContains: 'Transfer 4.00 USDC to'
    }
  }));

  // Test 3: USDC unlimited approval (max uint256)
  results.push(await harness.runTest({
    name: 'USDC unlimited approval (max uint256)',
    calldata: '0x095ea7b3' +
      '000000000000000000000000111111125421ca6dc452d289314280a0f8842a65' + // spender
      'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',  // max uint256
    contractAddress: usdcAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x095ea7b3',
      functionName: 'approve',
      intentContains: 'USDC'
    }
  }));

  return results;
}
