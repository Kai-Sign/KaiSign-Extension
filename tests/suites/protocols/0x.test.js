/**
 * 0x Exchange Proxy Tests
 *
 * OFF-CHAIN ROUTING:
 * 0x API aggregates liquidity from:
 *   - On-chain DEXs (Uniswap, Sushiswap, Curve, Balancer)
 *   - Off-chain RFQ market makers (professional liquidity providers)
 *
 * The `transformations[]` array contains:
 *   - deploymentNonce: Identifies which Transformer contract to use
 *   - data: Encoded instructions for that transformer
 *
 * Common transformers:
 *   - FillQuoteTransformer: Executes DEX swaps
 *   - PayTakerTransformer: Sends output to recipient
 *   - WethTransformer: Wraps/unwraps ETH
 */

import { CONTRACTS } from '../../config.js';
import { loadMetadata } from '../../lib/metadata-loader.js';

export async function runTests(harness) {
  const results = [];

  const zeroXAddress = CONTRACTS.dex.zeroXExchangeProxy.address.toLowerCase();

  // 0x transformERC20 decoded parameters:
  // - inputToken: USDC
  // - outputToken: WETH
  // - inputTokenAmount: 1,000,000 (1 USDC)
  // - minOutputTokenAmount: 1 ETH
  // - transformations: Off-chain computed transformer calls

  harness.addMetadata(zeroXAddress, loadMetadata('protocols/0x-exchange-proxy.json'));

  // Real 0x transformERC20 calldata
  // Swapping USDC -> WETH via 0x
  const transformERC20Calldata = '0x415565b0' +
    '000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' + // USDC (input)
    '000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' + // WETH (output)
    '00000000000000000000000000000000000000000000000000000000000f4240' + // 1M USDC
    '0000000000000000000000000000000000000000000000000de0b6b3a7640000' + // 1 ETH min out
    '00000000000000000000000000000000000000000000000000000000000000a0' + // transformations offset
    '0000000000000000000000000000000000000000000000000000000000000001' + // 1 transformation
    '0000000000000000000000000000000000000000000000000000000000000020' + // transformation offset
    '0000000000000000000000000000000000000000000000000000000000000001' + // deploymentNonce
    '0000000000000000000000000000000000000000000000000000000000000040' + // data offset
    '0000000000000000000000000000000000000000000000000000000000000020' + // data length
    '0000000000000000000000000000000000000000000000000000000000000000'; // data

  results.push(await harness.runTest({
    name: '0x transformERC20',
    calldata: transformERC20Calldata,
    contractAddress: zeroXAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x415565b0',
      functionName: 'transformERC20',
      intent: 'Swap 1.00 USDC via 0x',
      intentContains: '1.00'
    }
  }));

  return results;
}
