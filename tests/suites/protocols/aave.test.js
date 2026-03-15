/**
 * Aave V3 Protocol Tests
 */

import { CONTRACTS } from '../../config.js';
import { loadMetadata } from '../../lib/metadata-loader.js';

export async function runTests(harness) {
  const results = [];

  const poolAddress = CONTRACTS.lending.aaveV3Pool.address.toLowerCase();
  harness.addMetadata(poolAddress, loadMetadata('protocols/aave-v3-pool.json'));

  results.push(await harness.runTest({
    name: 'Aave V3 supply',
    calldata: '0x617ba037' +
      '000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' +
      '0000000000000000000000000000000000000000000000000000000005f5e100' +
      '000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045' +
      '0000000000000000000000000000000000000000000000000000000000000000',
    contractAddress: poolAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x617ba037',
      functionName: 'supply',
      intent: 'Supply 100.00 USDC to Aave',
      intentContains: '100.00'
    }
  }));

  // Test 2: withdraw(address asset, uint256 amount, address to)
  results.push(await harness.runTest({
    name: 'Aave V3 withdraw',
    calldata: '0x69328dec' +
      '000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' + // USDC
      '0000000000000000000000000000000000000000000000000000000005f5e100' + // 100 USDC
      '000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045',  // to
    contractAddress: poolAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x69328dec',
      functionName: 'withdraw',
      intentContains: 'Aave'
    }
  }));

  // Test 3: borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)
  results.push(await harness.runTest({
    name: 'Aave V3 borrow',
    calldata: '0xa415bcad' +
      '000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' + // USDC
      '00000000000000000000000000000000000000000000000000000000017d7840' + // 25000000 = 25 USDC
      '0000000000000000000000000000000000000000000000000000000000000002' + // variable rate
      '0000000000000000000000000000000000000000000000000000000000000000' + // referralCode
      '000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045',  // onBehalfOf
    contractAddress: poolAddress,
    expected: {
      shouldSucceed: true,
      selector: '0xa415bcad',
      functionName: 'borrow',
      intentContains: 'Aave'
    }
  }));

  // Test 4: repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf)
  results.push(await harness.runTest({
    name: 'Aave V3 repay',
    calldata: '0x573ade81' +
      '000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' + // USDC
      '00000000000000000000000000000000000000000000000000000000017d7840' + // 25 USDC
      '0000000000000000000000000000000000000000000000000000000000000002' + // variable rate
      '000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045',  // onBehalfOf
    contractAddress: poolAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x573ade81',
      functionName: 'repay',
      intentContains: 'Aave'
    }
  }));

  return results;
}
