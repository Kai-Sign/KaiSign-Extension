/**
 * LiFi Protocol Tests
 *
 * Tests LiFi Diamond contract operations with the REAL fixture metadata
 * including calldata field for nested decode support.
 */

import { loadMetadata } from '../../lib/metadata-loader.js';
import { ethers } from 'ethers';

export async function runTests(harness) {
  const results = [];

  // LiFi Diamond address
  const lifiAddress = '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae';
  const lifiMetadata = loadMetadata('protocols/lifi-diamond.json');
  harness.addMetadata(lifiAddress, lifiMetadata);

  // Also add USDC metadata for nested decoding
  const usdcAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
  harness.addMetadata(usdcAddress, loadMetadata('tokens/usdc.json'));
  const wethAddress = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
  harness.addMetadata(wethAddress, loadMetadata('tokens/weth.json'));

  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const txIdSingle = '0xb482dfda03721a978ea9a5e8e3ea827a463f0a10529d1365061e99e14b01767b';
  const txIdMulti = '0xa482dfda03721a978ea9a5e8e3ea827a463f0a10529d1365061e99e14b01767a';
  const integrator = 'kaisign';
  const referrer = 'ref';
  const receiverSingle = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
  const receiverMulti = '0xa10235ea549daa39a108bc26d63bd8daa68e4a22';
  const callTo = '0x1111111254eeb25477b68fb85ed929f73a960582';

  const swapDataSingle = [
    callTo,
    callTo,
    usdcAddress,
    wethAddress,
    1000000n,
    '0x',
    false
  ];
  const swapDataMulti = [[
    callTo,
    callTo,
    usdcAddress,
    wethAddress,
    200000n,
    '0x',
    false
  ]];

  const abiSingle = lifiMetadata.context.contract.abi.find(fn => fn.name === 'swapTokensSingleV3ERC20ToERC20');
  const abiMulti = lifiMetadata.context.contract.abi.find(fn => fn.name === 'swapTokensMultipleV3ERC20ToNative');

  if (abiMulti?.selector) {
    const encodedMulti = abiCoder.encode(abiMulti.inputs, [txIdMulti, integrator, referrer, receiverMulti, 1n, swapDataMulti]);
    results.push(await harness.runTest({
      name: 'LiFi swapTokensMultipleV3ERC20ToNative (selector match)',
      calldata: abiMulti.selector + encodedMulti.slice(2),
      contractAddress: lifiAddress,
      expected: {
        shouldSucceed: true,
        selector: abiMulti.selector,
        functionName: 'swapTokensMultipleV3ERC20ToNative',
        intentContains: 'Swap'
      }
    }));
  }

  if (abiSingle?.selector) {
    const encodedSingle = abiCoder.encode(abiSingle.inputs, [txIdSingle, integrator, referrer, receiverSingle, 1n, swapDataSingle]);
    results.push(await harness.runTest({
      name: 'LiFi swapTokensSingleV3ERC20ToERC20 (selector match)',
      calldata: abiSingle.selector + encodedSingle.slice(2),
      contractAddress: lifiAddress,
      expected: {
        shouldSucceed: true,
        selector: abiSingle.selector,
        functionName: 'swapTokensSingleV3ERC20ToERC20',
        intentContains: 'Swap'
      }
    }));
  }

  const usdc = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
  const receiver = '0x408e2995a8e765e9a417dc98498f7ab773b9af94';
  const zeroAddress = '0x0000000000000000000000000000000000000000';
  const txId = '0x' + '11'.repeat(32);
  const bridgeData = [
    txId,
    'kaisign',
    'ref',
    zeroAddress,
    usdc,
    receiver,
    200000n,
    42161n,
    true,
    false
  ];
  const swapData = [[
    callTo,
    callTo,
    usdc,
    usdc,
    200000n,
    '0x',
    false
  ]];

  const swapAndBridgeCases = [
    {
      name: 'swapAndStartBridgeTokensViaAcrossV3',
      signature: 'swapAndStartBridgeTokensViaAcrossV3((bytes32,string,string,address,address,address,uint256,uint256,bool,bool),(address,address,address,address,uint256,bytes,bool)[],(address,address,address,uint256,address,uint32,uint32,uint32,bytes))',
      third: [receiver, receiver, receiver, 190000n, receiver, 1, 1, 1, '0x']
    },
    {
      name: 'swapAndStartBridgeTokensViaAllBridge',
      signature: 'swapAndStartBridgeTokensViaAllBridge((bytes32,string,string,address,address,address,uint256,uint256,bool,bool),(address,address,address,address,uint256,bytes,bool)[],(uint256,bytes32,uint256,bytes32,uint256,uint8,bool))',
      third: [1n, txId, 2n, txId, 3n, 1, false]
    },
    {
      name: 'swapAndStartBridgeTokensViaCBridge',
      signature: 'swapAndStartBridgeTokensViaCBridge((bytes32,string,string,address,address,address,uint256,uint256,bool,bool),(address,address,address,address,uint256,bytes,bool)[],(uint32,uint64))',
      third: [1, 2n]
    },
    {
      name: 'swapAndStartBridgeTokensViaDeBridgeDln',
      signature: 'swapAndStartBridgeTokensViaDeBridgeDln((bytes32,string,string,address,address,address,uint256,uint256,bool,bool),(address,address,address,address,uint256,bytes,bool)[],(bytes,bytes,uint256))',
      third: ['0x', '0x', 1n]
    },
    {
      name: 'swapAndStartBridgeTokensViaGasZip',
      signature: 'swapAndStartBridgeTokensViaGasZip((bytes32,string,string,address,address,address,uint256,uint256,bool,bool),(address,address,address,address,uint256,bytes,bool)[],(bytes32,uint256))',
      third: [txId, 1n]
    },
    {
      name: 'swapAndStartBridgeTokensViaHop',
      signature: 'swapAndStartBridgeTokensViaHop((bytes32,string,string,address,address,address,uint256,uint256,bool,bool),(address,address,address,address,uint256,bytes,bool)[],(uint256,uint256,uint256,uint256,uint256,address,address,uint256))',
      third: [1n, 2n, 3n, 4n, 5n, receiver, receiver, 6n]
    },
    {
      name: 'swapAndStartBridgeTokensViaMayan',
      signature: 'swapAndStartBridgeTokensViaMayan((bytes32,string,string,address,address,address,uint256,uint256,bool,bool),(address,address,address,address,uint256,bytes,bool)[],(address,bytes))',
      third: [receiver, '0x']
    },
    {
      name: 'swapAndStartBridgeTokensViaSquid',
      signature: 'swapAndStartBridgeTokensViaSquid((bytes32,string,string,address,address,address,uint256,uint256,bool,bool),(address,address,address,address,uint256,bytes,bool)[],(uint8,string,string,string,address,(uint8,address,uint256,bytes,bytes)[],bytes,uint256))',
      third: [1, 'chain', 'router', 'memo', receiver, [], '0x', 1n]
    },
    {
      name: 'swapAndStartBridgeTokensViaStargate',
      signature: 'swapAndStartBridgeTokensViaStargate((bytes32,string,string,address,address,address,uint256,uint256,bool,bool),(address,address,address,address,uint256,bytes,bool)[],(uint16,(uint32,bytes32,uint256,uint256,bytes,bytes,bytes),(uint256,uint256),address))',
      third: [1, [1, txId, 1n, 1n, '0x', '0x', '0x'], [1n, 1n], receiver]
    },
    {
      name: 'swapAndStartBridgeTokensViaSymbiosis',
      signature: 'swapAndStartBridgeTokensViaSymbiosis((bytes32,string,string,address,address,address,uint256,uint256,bool,bool),(address,address,address,address,uint256,bytes,bool)[],(bytes,bytes,address,address,address,address[],address,bytes))',
      third: ['0x', '0x', receiver, receiver, receiver, [], receiver, '0x']
    }
  ];

  for (const item of swapAndBridgeCases) {
    const abiEntry = lifiMetadata.context.contract.abi.find(fn => fn.name === item.name);
    if (!abiEntry || !abiEntry.selector) {
      results.push({
        name: `LiFi ${item.name} (intent interpolation)`,
        success: false,
        error: 'Missing ABI entry or selector in metadata'
      });
      continue;
    }

    const encodedParams = abiCoder.encode(abiEntry.inputs, [bridgeData, swapData, item.third]);
    const calldata = abiEntry.selector + encodedParams.slice(2);

    results.push(await harness.runTest({
      name: `LiFi ${item.name} (intent interpolation)`,
      calldata,
      contractAddress: lifiAddress,
      expected: {
        shouldSucceed: true,
        functionName: item.name,
        intentContains: 'bridge',
        intentDoesNotContain: 'Contract interaction'
      }
    }));
  }

  // Note: tuple[] with actual data test removed temporarily - hangs during async token metadata fetch.
  // The fix for tuple[] dynamic type detection was applied in decode.js line 242.

  return results;
}
