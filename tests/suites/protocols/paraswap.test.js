/**
 * ParaSwap Augustus V6 Tests
 *
 * OFF-CHAIN ROUTING:
 * ParaSwap API computes optimal route and returns:
 *   - callees[]: DEX contracts to call (Uniswap, Curve, Balancer, etc.)
 *   - exchangeData: Concatenated calldata for each DEX
 *   - startIndexes[]: Byte offset where each callee's data starts in exchangeData
 *   - values[]: ETH value to send with each call
 *
 * The API splits the swap across multiple DEXs for best execution.
 * Example: 60% via Uniswap V3, 40% via Curve
 */

import { CONTRACTS } from '../../config.js';

export async function runTests(harness) {
  const results = [];

  const augustusAddress = CONTRACTS.dex.paraswapAugustusV6.address.toLowerCase();

  // ParaSwap simpleSwap decoded parameters:
  // - fromToken: USDC (0xa0b86991...)
  // - toToken: WETH (0xc02aaa39...)
  // - fromAmount: 1,000,000 (1 USDC with 6 decimals)
  // - toAmount: 1 ETH minimum
  // - callees: DEX contracts (off-chain computed)
  // - exchangeData: Encoded swap calls (off-chain computed)

  harness.addMetadata(augustusAddress, {
    context: {
      contract: {
        address: augustusAddress,
        chainId: 1,
        name: 'ParaSwap Augustus V6',
        abi: [
          {
            type: 'function',
            name: 'simpleSwap',
            selector: '0x54e3f31b',
            inputs: [
              {
                name: 'data',
                type: 'tuple',
                components: [
                  { name: 'fromToken', type: 'address' },
                  { name: 'toToken', type: 'address' },
                  { name: 'fromAmount', type: 'uint256' },
                  { name: 'toAmount', type: 'uint256' },
                  { name: 'expectedAmount', type: 'uint256' },
                  { name: 'callees', type: 'address[]' },
                  { name: 'exchangeData', type: 'bytes' },
                  { name: 'startIndexes', type: 'uint256[]' },
                  { name: 'values', type: 'uint256[]' },
                  { name: 'beneficiary', type: 'address' },
                  { name: 'partner', type: 'address' },
                  { name: 'feePercent', type: 'uint256' },
                  { name: 'permit', type: 'bytes' },
                  { name: 'deadline', type: 'uint256' },
                  { name: 'uuid', type: 'bytes16' }
                ]
              }
            ]
          },
          {
            type: 'function',
            name: 'multiSwap',
            selector: '0xa94e78ef',
            inputs: [{ name: 'data', type: 'tuple', components: [] }]
          },
          {
            type: 'function',
            name: 'megaSwap',
            selector: '0x46c67b6d',
            inputs: [{ name: 'data', type: 'tuple', components: [] }]
          }
        ]
      }
    },
    display: {
      formats: {
        'simpleSwap(tuple)': {
          intent: 'Swap tokens via ParaSwap',
          fields: [
            { path: 'data', label: 'Swap Data', format: 'raw' }
          ]
        },
        'multiSwap(tuple)': { intent: 'Multi-hop swap via ParaSwap', fields: [] },
        'megaSwap(tuple)': { intent: 'Mega swap via ParaSwap', fields: [] }
      }
    }
  });

  // Real ParaSwap simpleSwap transaction calldata (simplified)
  // From tx: 0x... on mainnet
  const simpleSwapCalldata = '0x54e3f31b' +
    '0000000000000000000000000000000000000000000000000000000000000020' + // offset
    '000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' + // USDC
    '000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' + // WETH
    '00000000000000000000000000000000000000000000000000000000000f4240' + // 1M USDC
    '0000000000000000000000000000000000000000000000000de0b6b3a7640000' + // 1 ETH min
    '0000000000000000000000000000000000000000000000000de0b6b3a7640000' + // expected
    '0000000000000000000000000000000000000000000000000000000000000200' + // callees offset
    '0000000000000000000000000000000000000000000000000000000000000240' + // exchangeData offset
    '0000000000000000000000000000000000000000000000000000000000000280' + // startIndexes offset
    '00000000000000000000000000000000000000000000000000000000000002c0' + // values offset
    '000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045' + // beneficiary
    '0000000000000000000000000000000000000000000000000000000000000000' + // partner
    '0000000000000000000000000000000000000000000000000000000000000000' + // feePercent
    '0000000000000000000000000000000000000000000000000000000000000300' + // permit offset
    '0000000000000000000000000000000000000000000000000000000067890000' + // deadline
    '00000000000000000000000000000000000000000000000000000000deadbeef' + // uuid (partial)
    '0000000000000000000000000000000000000000000000000000000000000000'; // padding

  results.push(await harness.runTest({
    name: 'ParaSwap simpleSwap',
    calldata: simpleSwapCalldata,
    contractAddress: augustusAddress,
    expected: { shouldSucceed: true, selector: '0x54e3f31b', functionName: 'simpleSwap', intentContains: 'Swap' }
  }));

  return results;
}
