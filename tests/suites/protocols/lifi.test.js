/**
 * LiFi Protocol Tests
 *
 * Tests LiFi Diamond contract operations with the REAL fixture metadata
 * including calldata field for nested decode support.
 */

import { loadMetadata } from '../../lib/metadata-loader.js';

export async function runTests(harness) {
  const results = [];

  // LiFi Diamond address
  const lifiAddress = '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae';
  harness.addMetadata(lifiAddress, loadMetadata('protocols/lifi-diamond.json'));

  // Also add USDC metadata for nested decoding
  const usdcAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
  harness.addMetadata(usdcAddress, loadMetadata('tokens/usdc.json'));

  // Test swapTokensMultipleV3ERC20ToNative - minimal calldata
  // Just enough to test selector matching and intent
  results.push(await harness.runTest({
    name: 'LiFi swapTokensMultipleV3ERC20ToNative (selector match)',
    calldata: '0xd24c2325' +
      // _transactionId (bytes32)
      'a482dfda03721a978ea9a5e8e3ea827a463f0a10529d1365061e99e14b01767a' +
      // minimal padding for string offsets and receiver
      '00000000000000000000000000000000000000000000000000000000000000c0' +
      '0000000000000000000000000000000000000000000000000000000000000100' +
      '000000000000000000000000a10235ea549daa39a108bc26d63bd8daa68e4a22' +
      '00000000000000000000000000000000000000000000000000008f1d65866b8b' +
      '0000000000000000000000000000000000000000000000000000000000000140' +
      // empty strings
      '0000000000000000000000000000000000000000000000000000000000000000' +
      '0000000000000000000000000000000000000000000000000000000000000000' +
      // empty swap array
      '0000000000000000000000000000000000000000000000000000000000000000',
    contractAddress: lifiAddress,
    expected: {
      shouldSucceed: true,
      selector: '0xd24c2325',
      functionName: 'swapTokensMultipleV3ERC20ToNative',
      intentContains: 'Swap'
    }
  }));

  // Test swapTokensSingleV3ERC20ToERC20 - minimal calldata
  results.push(await harness.runTest({
    name: 'LiFi swapTokensSingleV3ERC20ToERC20 (selector match)',
    calldata: '0x54e97ec9' +
      // _transactionId
      'b482dfda03721a978ea9a5e8e3ea827a463f0a10529d1365061e99e14b01767b' +
      // offsets and receiver
      '00000000000000000000000000000000000000000000000000000000000000c0' +
      '0000000000000000000000000000000000000000000000000000000000000100' +
      '000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045' +
      '0000000000000000000000000000000000000000000000000de0b6b3a7640000' +
      '0000000000000000000000000000000000000000000000000000000000000140' +
      // empty strings
      '0000000000000000000000000000000000000000000000000000000000000000' +
      '0000000000000000000000000000000000000000000000000000000000000000' +
      // swapData tuple (callTo, approveTo, sendingAsset, receivingAsset, amount, callData offset, requiresDeposit)
      '0000000000000000000000001111111254eeb25477b68fb85ed929f73a960582' +
      '0000000000000000000000001111111254eeb25477b68fb85ed929f73a960582' +
      '000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' +
      '000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' +
      '00000000000000000000000000000000000000000000000000000000000f4240' +
      '00000000000000000000000000000000000000000000000000000000000000e0' +
      '0000000000000000000000000000000000000000000000000000000000000001' +
      // empty callData
      '0000000000000000000000000000000000000000000000000000000000000000',
    contractAddress: lifiAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x54e97ec9',
      functionName: 'swapTokensSingleV3ERC20ToERC20',
      intentContains: 'Swap'
    }
  }));

  return results;
}
