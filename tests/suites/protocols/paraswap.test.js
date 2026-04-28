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
import { loadMetadata } from '../../lib/metadata-loader.js';

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

  harness.addMetadata(augustusAddress, loadMetadata('protocols/paraswap-augustus-v6.json'));

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
    expected: {
      shouldSucceed: true,
      selector: '0x54e3f31b',
      functionName: 'simpleSwap',
      intentContains: 'Swap'
      // interpolatedIntent: "Swap {data.fromAmount} via ParaSwap" → "Swap 1.00 USDC via ParaSwap"
    }
  }));

  results.push(await harness.runTest({
    name: 'ParaSwap Arbitrum UniswapV3 selector 0x876a02f6',
    calldata: '0x876a02f6000000000000000000000000000000000000000000000000000000000000006008a3c2a819e3de7aca384c798269b3ce1cd0e43790000000000000000000000000000000000000000000000000000000000000000000000000000000000001e0000000000000000000000000eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee0000000000000000000000005979d7b546e38e414f7e9822514be443a4800529000000000000000000000000000000000000000000000000002386f26fc10000000000000000000000000000000000000000000000000000001ce00a3eed9486000000000000000000000000000000000000000000000000001ce7708097b74540a023df7cbe449dafc5e8683f12f6130000000000000000000000001b3f2f0f0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000600000000000000000000000005979d7b546e38e414f7e9822514be443a480052900000000000000000000000082af49447d8a07e3bd95bd0d56f35241523fbab100000000000000000000000000000000000000000000000000000000000000640000000000000000000000000000000000000000000000000000000000000000',
    contractAddress: augustusAddress,
    chainId: 42161,
    expected: {
      shouldSucceed: true,
      selector: '0x876a02f6',
      functionName: 'swapExactAmountInOnUniswapV3',
      intentContains: 'Swap'
    }
  }));

  return results;
}
