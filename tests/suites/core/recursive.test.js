/**
 * Recursive Decoder Tests
 *
 * Tests nested calldata decoding:
 * - Calldata field resolution
 * - Array path decoding (calls.[].data)
 * - Intent aggregation from nested calls
 */

import { readFile } from 'node:fs/promises';
import { ethers } from 'ethers';
import { CONTRACTS } from '../../config.js';
import { loadMetadata } from '../../lib/metadata-loader.js';

export async function runTests(harness) {
  const results = [];

  const safeSingletonAddress = CONTRACTS.accountAbstraction.safeSingleton.address.toLowerCase();
  const usdcAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';

  harness.addMetadata(safeSingletonAddress, loadMetadata('aa/safe-singleton.json'));
  harness.addMetadata(usdcAddress, loadMetadata('tokens/usdc.json'));

  results.push(await harness.runRecursiveTest({
    name: 'Recursive decode: Safe execTransaction → USDC approve',
    calldata: '0x6a761202' +
      '000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' + // to: USDC
      '0000000000000000000000000000000000000000000000000000000000000000' + // value: 0
      '0000000000000000000000000000000000000000000000000000000000000140' + // data offset
      '0000000000000000000000000000000000000000000000000000000000000000' + // operation: Call
      '0000000000000000000000000000000000000000000000000000000000000000' + // safeTxGas
      '0000000000000000000000000000000000000000000000000000000000000000' + // baseGas
      '0000000000000000000000000000000000000000000000000000000000000000' + // gasPrice
      '0000000000000000000000000000000000000000000000000000000000000000' + // gasToken
      '0000000000000000000000000000000000000000000000000000000000000000' + // refundReceiver
      '00000000000000000000000000000000000000000000000000000000000001a0' + // signatures offset
      '0000000000000000000000000000000000000000000000000000000000000044' + // data length
      '095ea7b3' + // approve selector
      '000000000000000000000000111111125421ca6dc452d289314280a0f8842a65' + // spender
      'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' + // amount (max)
      '0000000000000000000000000000000000000000000000000000000000000041' + // sig length
      '0000000000000000000000000000000000000000000000000000000000000000' + // sig padding
      '0000000000000000000000000000000000000000000000000000000000000000' + // sig padding
      '0000000000000000000000000000000000000000000000000000000000000000', // sig padding
    contractAddress: safeSingletonAddress,
    expected: {
      shouldSucceed: true,
      functionName: 'execTransaction',
      nestedIntentCount: 1,
      nestedIntentContains: ['Approve Unlimited USDC']
    }
  }));

  const multicallAddress = '0xtest9999999999999999999999999999999999';
  const multicallIface = new ethers.Interface([
    'function aggregate((address to, bytes data)[] calls)'
  ]);
  const multicallSelector = multicallIface.getFunction('aggregate').selector;
  const multicallAbi = [
    {
      type: 'function',
      name: 'aggregate',
      selector: multicallSelector,
      inputs: [
        {
          name: 'calls',
          type: 'tuple[]',
          components: [
            { name: 'to', type: 'address' },
            { name: 'data', type: 'bytes' }
          ]
        }
      ]
    }
  ];

  harness.addMetadata(multicallAddress, {
    context: {
      contract: {
        address: multicallAddress,
        chainId: 1,
        name: 'Test Multicall',
        abi: multicallAbi
      }
    },
    display: {
      formats: {
        'aggregate(tuple[])': {
          intent: 'Aggregate calls',
          fields: [
            {
              path: 'calls.[].data',
              label: 'Calls',
              format: 'calldata',
              type: 'calldata',
              params: { calleePath: 'calls.[].to' }
            }
          ]
        }
      }
    }
  });

  const wethAddress = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
  harness.addMetadata(wethAddress, loadMetadata('tokens/weth.json'));

  const usdcIface = new ethers.Interface([
    'function approve(address spender,uint256 value)'
  ]);
  const wethIface = new ethers.Interface([
    'function approve(address guy,uint256 wad)'
  ]);

  const spender = '0x111111125421ca6dc452d289314280a0f8842a65';
  const multicallCalldata = multicallIface.encodeFunctionData('aggregate', [[
    {
      to: usdcAddress,
      data: usdcIface.encodeFunctionData('approve', [spender, ethers.MaxUint256])
    },
    {
      to: wethAddress,
      data: wethIface.encodeFunctionData('approve', [spender, ethers.parseUnits('1', 18)])
    }
  ]]);

  results.push(await harness.runRecursiveTest({
    name: 'Recursive decode: array path calls.[].data',
    calldata: multicallCalldata,
    contractAddress: multicallAddress,
    expected: {
      shouldSucceed: true,
      functionName: 'aggregate',
      nestedIntentCount: 2,
      nestedIntentContains: ['Approve Unlimited USDC', 'Approve WETH spending']
    }
  }));

  {
    const start = Date.now();
    try {
      const source = await readFile(new URL('../../../recursive-decoder.js', import.meta.url), 'utf8');
      const passed = source.includes('let metadata = decoded.metadata || null;')
        && source.includes("console.log('[RecursiveDecoder] Reusing metadata from initial decode')");

      results.push(harness.createResult(
        'Recursive decoder reuses metadata from initial decode before refetching',
        passed,
        { success: passed, intent: 'Avoids duplicate metadata fetches for non-recursive calls' },
        {},
        passed ? null : 'recursive-decoder.js still refetches metadata unconditionally',
        Date.now() - start
      ));
    } catch (error) {
      results.push(harness.createResult(
        'Recursive decoder reuses metadata from initial decode before refetching',
        false,
        { success: false, intent: null },
        {},
        error.message,
        0
      ));
    }
  }

  return results;
}
