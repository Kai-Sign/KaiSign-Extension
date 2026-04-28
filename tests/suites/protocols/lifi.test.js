/**
 * LiFi Protocol Tests
 *
 * Tests LiFi Diamond contract operations with the REAL fixture metadata
 * including calldata field for nested decode support.
 */

import { ethers } from 'ethers';
import { loadMetadata } from '../../lib/metadata-loader.js';

export async function runTests(harness) {
  const results = [];

  // LiFi Diamond address
  const lifiAddress = '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae';
  harness.addMetadata(lifiAddress, loadMetadata('protocols/lifi-diamond.json'));

  // Also add USDC metadata for nested decoding
  const usdcAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
  harness.addMetadata(usdcAddress, loadMetadata('tokens/usdc.json'));

  // Test swapTokensMultipleV3ERC20ToNative - uses selector 0x2c57e884 from backend metadata
  results.push(await harness.runTest({
    name: 'LiFi swapTokensMultipleV3ERC20ToNative (selector match)',
    calldata: '0x2c57e884' +
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
      selector: '0x2c57e884',
      functionName: 'swapTokensMultipleV3ERC20ToNative',
      intentContains: 'Swap'
    }
  }));

  // Test swapTokensSingleV3ERC20ToERC20 - minimal calldata
  results.push(await harness.runTest({
    name: 'LiFi swapTokensSingleV3ERC20ToERC20 (selector match)',
    calldata: '0x4666fc80' +
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
      selector: '0x4666fc80',
      functionName: 'swapTokensSingleV3ERC20ToERC20',
      intentContains: 'Swap'
    }
  }));

  // Test nested calldata resolution with #._swapData.[].callTo path
  // This test verifies the fix for resolving #. prefixed calleePath
  // WITHOUT the fix: decoder tries to use receiver address (0xa10235ea...) which has no metadata
  // WITH the fix: decoder resolves #._swapData.[].callTo to USDC address and decodes approve call
  const lifiIface = new ethers.Interface([
    'function swapTokensMultipleV3ERC20ToNative(bytes32 _transactionId, string _integrator, string _referrer, address _receiver, uint256 _minAmountOut, tuple(address callTo, address approveTo, address sendingAssetId, address receivingAssetId, uint256 fromAmount, bytes callData, bool requiresDeposit)[] _swapData)'
  ]);

  const usdcIface = new ethers.Interface([
    'function approve(address spender, uint256 amount)'
  ]);

  // Create approve calldata for USDC
  const approveCalldata = usdcIface.encodeFunctionData('approve', [
    '0x1111111254EEB25477B68fb85Ed929f73A960582', // 1inch router
    ethers.MaxUint256
  ]);

  // Encode full LiFi swap with nested calldata
  const lifiCalldata = lifiIface.encodeFunctionData('swapTokensMultipleV3ERC20ToNative', [
    '0xa482dfda03721a978ea9a5e8e3ea827a463f0a10529d1365061e99e14b01767a', // txId
    'test-integrator',
    'test-referrer',
    '0xa10235ea549daa39a108bc26d63bd8daa68e4a22', // receiver (NOT the callTo target)
    ethers.parseEther('0.001'), // minAmountOut
    [
      {
        callTo: usdcAddress, // This is what #._swapData.[].callTo should resolve to
        approveTo: usdcAddress,
        sendingAssetId: usdcAddress,
        receivingAssetId: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
        fromAmount: ethers.parseUnits('100', 6), // 100 USDC
        callData: approveCalldata, // Nested calldata to decode
        requiresDeposit: false
      }
    ]
  ]);

  results.push(await harness.runRecursiveTest({
    name: 'LiFi nested calldata with #. path resolution',
    calldata: lifiCalldata,
    contractAddress: lifiAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x2c57e884',
      functionName: 'swapTokensMultipleV3ERC20ToNative',
      intentContains: 'Swap',
      intentDoesNotContain: 'Approve Unlimited USDC'
    }
  }));

  const lifiSingleIface = new ethers.Interface([
    'function swapTokensSingleV3ERC20ToERC20(bytes32 _transactionId, string _integrator, string _referrer, address _receiver, uint256 _minAmountOut, tuple(address callTo, address approveTo, address sendingAssetId, address receivingAssetId, uint256 fromAmount, bytes callData, bool requiresDeposit) _swapData)'
  ]);

  const lifiSingleCalldata = lifiSingleIface.encodeFunctionData('swapTokensSingleV3ERC20ToERC20', [
    '0xa482dfda03721a978ea9a5e8e3ea827a463f0a10529d1365061e99e14b01767a',
    'kaisign-smoke',
    'smoke',
    '0xa10235ea549daa39a108bc26d63bd8daa68e4a22',
    ethers.parseUnits('1', 15),
    {
      callTo: usdcAddress,
      approveTo: usdcAddress,
      sendingAssetId: usdcAddress,
      receivingAssetId: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      fromAmount: ethers.parseUnits('100', 6),
      callData: approveCalldata,
      requiresDeposit: false
    }
  ]);

  results.push(await harness.runRecursiveTest({
    name: 'LiFi single ERC20 swap keeps wrapper title with nested approval',
    calldata: lifiSingleCalldata,
    contractAddress: lifiAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x4666fc80',
      functionName: 'swapTokensSingleV3ERC20ToERC20',
      intentContains: 'Swap',
      intentDoesNotContain: 'Approve Unlimited USDC'
    }
  }));

  results.push(await harness.runTest({
    name: 'LiFi startBridgeTokensViaNEARIntents (selector match)',
    calldata: '0x5cf8113b000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000002002e5792d23fedf62019b45f864cbae164aa10238969137128d510678bfd2475140000000000000000000000000000000000000000000000000000000000000140000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000638252f8b5977b5a870756955164319fc9dadf5b000000000000000000000000000000000000000000000000002386f26fc1000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000046e65617200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000f6a756d7065722e65786368616e67650000000000000000000000000000000000000000000000000000000000638252f8b5977b5a870756955164319fc9dadf5b0000000000000000000000001f0689934b8c462ac2bd647f85a07585ed92bd74fe6d19ad9089e81df61019d39dfa7959e9bd0c4217dbd598e386a6f664eb05330000000000000000000000000000000000000000000000000000000069f1a562000000000000000000000000000000000000000000000000000000000155cb90000000000000000000000000638252f8b5977b5a870756955164319fc9dadf5b00000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000041ee491876c60b19b72308c0ddc8e9a02365931104be3ecfa5665f7a9763ffd4d23b3b42fde22eb8e0a80d1bfe041125c6c0307bb81c1024d4eb00593f7885563b1b00000000000000000000000000000000000000000000000000000000000000',
    contractAddress: lifiAddress,
    chainId: 42161,
    expected: {
      shouldSucceed: true,
      selector: '0x5cf8113b',
      functionName: 'startBridgeTokensViaNEARIntents',
      intentContains: '0.01 ETH'
    }
  }));

  results.push(await harness.runTest({
    name: 'LiFi startBridgeTokensViaRelayDepository (selector match)',
    calldata: '0x092e8fa4000000000000000000000000000000000000000000000000000000000000006070e78cacbe01685bf25d641d35c91cbaf5a002dfe83fe53964365485173a9f46000000000000000000000000638252f8b5977b5a870756955164319fc9dadf5b4940915f2580e36b2e36b51cc93bc97c55590d815216c2b272d2538fee9700760000000000000000000000000000000000000000000000000000000000000140000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000638252f8b5977b5a870756955164319fc9dadf5b0000000000000000000000000000000000000000000000000029b7e8a1206313000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000f72656c61796465706f7369746f72790000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000f6a756d7065722e65786368616e67650000000000000000000000000000000000',
    contractAddress: lifiAddress,
    chainId: 42161,
    expected: {
      shouldSucceed: true,
      selector: '0x092e8fa4',
      functionName: 'startBridgeTokensViaRelayDepository',
      intentContains: 'Relay Depository'
    }
  }));

  return results;
}
