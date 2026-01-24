/**
 * Aave V3 Protocol Tests
 */

import { CONTRACTS } from '../../config.js';
import { loadMetadata } from '../../lib/metadata-loader.js';

export async function runTests(harness) {
  const results = [];

  const poolAddress = CONTRACTS.lending.aaveV3Pool.address.toLowerCase();
  harness.addMetadata(poolAddress, loadMetadata('protocols/aave-v3-pool.json'));
  const wethGatewayAddress = '0xd01607c3c5ecaba394d8be377a08590149325722';
  harness.addMetadata(wethGatewayAddress, loadMetadata('lending/aave-v3-weth-gateway-ethereum.json'));

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

  const wethGatewayCalldata = '0x474cf53d00000000000000000000000087870bca3f3fd6335c3f4ce8392d69350b4fa4e2000000000000000000000000408e2995a8e765e9a417dc98498f7ab773b9af940000000000000000000000000000000000000000000000000000000000000000';

  results.push(await harness.runTest({
    name: 'Aave WETH Gateway depositETH',
    calldata: wethGatewayCalldata,
    contractAddress: wethGatewayAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x474cf53d',
      functionName: 'depositETH',
      intent: 'Supply ETH to Aave'
    }
  }));

  return results;
}
