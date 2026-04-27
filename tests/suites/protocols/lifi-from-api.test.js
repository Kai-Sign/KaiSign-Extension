/**
 * LiFi-from-API tests
 *
 * Reproduces the production decoder failures captured in
 * kaisign-export-1777280840473.json by using the EXACT metadata shape
 * returned by the production Railway backend
 * (tests/fixtures/metadata/protocols/lifi-diamond-from-api.json).
 *
 * The curated tests/fixtures/metadata/protocols/lifi-diamond.json
 * fixture has been hand-tuned to make existing tests pass and does NOT
 * reproduce the production crash. The production fixture has 37 ABI
 * entries and 38 display.formats keys (including both expanded-tuple
 * AND `tuple` placeholder variants), which exercises the exact decoder
 * path that fails in the wallet popup.
 *
 * Calldata is generated via ethers.Interface so byte alignment is
 * Solidity-canonical; we don't try to hand-format hex.
 *
 * Cases:
 *   B. swapTokensSingleV3ERC20ToERC20 (0x4666fc80) — production tx 0
 *      → decoder must NOT throw "ABI decode: offset 7.44e76 beyond
 *        data length 672"; success=true; intent starts with "Swap"
 *   D. swapTokensMultipleV3ERC20ToERC20 (0x5fd9ae2e) — production tx 2/3
 *      → decoder must produce wrapper intent starting with "Swap"
 *        (NOT collapse to "Approve Unlimited USDC + Approve Unlimited DAI")
 *      Note: API metadata contains NO ABI entry for 0x5fd9ae2e but DOES
 *      contain a display.format key whose canonical-keccak yields
 *      0x5fd9ae2e — decoder must learn to fall back to format-keys.
 */

import { ethers } from 'ethers';
import { loadMetadata } from '../../lib/metadata-loader.js';

export async function runTests(harness) {
  const results = [];

  const lifiAddress = '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae';
  const usdcAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';

  // Use the PRODUCTION API fixture, not the curated one
  harness.addMetadata(lifiAddress, loadMetadata('protocols/lifi-diamond-from-api.json'));
  harness.addMetadata(usdcAddress, loadMetadata('tokens/usdc.json'));

  // Build approve calldata once for nested decoding
  const erc20 = new ethers.Interface(['function approve(address spender, uint256 amount)']);
  const approveCalldata = erc20.encodeFunctionData('approve', [
    '0x1111111254EEB25477B68fb85Ed929f73A960582',
    ethers.MaxUint256
  ]);

  // ---- Case B: production tx 0 ----
  // Single-tuple swap. Mirrors production transaction 0 exactly.
  const lifiSingleIface = new ethers.Interface([
    'function swapTokensSingleV3ERC20ToERC20(' +
      'bytes32 _transactionId,string _integrator,string _referrer,' +
      'address _receiver,uint256 _minAmountOut,' +
      'tuple(address callTo,address approveTo,address sendingAssetId,address receivingAssetId,' +
      'uint256 fromAmount,bytes callData,bool requiresDeposit) _swapData)'
  ]);
  const tx0Calldata = lifiSingleIface.encodeFunctionData('swapTokensSingleV3ERC20ToERC20', [
    '0xa482dfda03721a978ea9a5e8e3ea827a463f0a10529d1365061e99e14b01767a',
    'kaisign-smoke',
    'smoke',
    '0xa10235ea549daa39a108bc26d63bd8daa68e4a22',
    1000000000000000n,
    {
      callTo: usdcAddress,
      approveTo: usdcAddress,
      sendingAssetId: usdcAddress,
      receivingAssetId: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      fromAmount: 100000000n,
      callData: approveCalldata,
      requiresDeposit: false
    }
  ]);
  if (!tx0Calldata.startsWith('0x4666fc80')) {
    throw new Error(`Expected 0x4666fc80, got ${tx0Calldata.slice(0, 10)}`);
  }

  results.push(await harness.runTest({
    name: 'LiFi 0x4666fc80 from production API metadata decodes (Bug B reproduction)',
    calldata: tx0Calldata,
    contractAddress: lifiAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x4666fc80',
      functionName: 'swapTokensSingleV3ERC20ToERC20',
      intentContains: 'Swap'
    }
  }));

  // ---- Case D: production tx 2/3 ----
  // Multi-leg swap whose nested calldata is approve calls. With Bug D,
  // wrapper intent gets discarded and title becomes "Approve Unlimited USDC + Approve Unlimited DAI".
  const lifiMultiIface = new ethers.Interface([
    'function swapTokensMultipleV3ERC20ToERC20(' +
      'bytes32 _transactionId,string _integrator,string _referrer,' +
      'address _receiver,uint256 _minAmountOut,' +
      'tuple(address callTo,address approveTo,address sendingAssetId,address receivingAssetId,' +
      'uint256 fromAmount,bytes callData,bool requiresDeposit)[] _swapData)'
  ]);
  const swapLeg = {
    callTo: usdcAddress,
    approveTo: usdcAddress,
    sendingAssetId: usdcAddress,
    receivingAssetId: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    fromAmount: 100000000n,
    callData: approveCalldata,
    requiresDeposit: false
  };
  const tx2Calldata = lifiMultiIface.encodeFunctionData('swapTokensMultipleV3ERC20ToERC20', [
    '0xa482dfda03721a978ea9a5e8e3ea827a463f0a10529d1365061e99e14b01767a',
    'kaisign-smoke',
    'smoke',
    '0xa10235ea549daa39a108bc26d63bd8daa68e4a22',
    1000000000000000n,
    [swapLeg, swapLeg]
  ]);
  if (!tx2Calldata.startsWith('0x5fd9ae2e')) {
    throw new Error(`Expected 0x5fd9ae2e, got ${tx2Calldata.slice(0, 10)}`);
  }

  results.push(await harness.runRecursiveTest({
    name: 'LiFi 0x5fd9ae2e from production API metadata keeps wrapper intent (Bug D reproduction)',
    calldata: tx2Calldata,
    contractAddress: lifiAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x5fd9ae2e',
      functionName: 'swapTokensMultipleV3ERC20ToERC20',
      intentContains: 'Swap',
      intentDoesNotContain: 'Approve Unlimited'
    }
  }));

  return results;
}
