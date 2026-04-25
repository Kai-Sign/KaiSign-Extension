/**
 * Regenerate calldata blobs in tests/smoke.html.
 *
 * Smoke page hits 3 fix paths:
 *   - ERC-20 decimals fallback (USDC transfer with no curated metadata)
 *   - noFormat marker (setApprovalForAll on an ERC-721 with no curated formats)
 *   - Nested-intent dedup (LiFi multi-leg swaps in 4 variants)
 *
 * Run:  node tests/scripts/build-smoke.js
 */

import { Interface, MaxUint256, parseEther, parseUnits } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SMOKE_HTML = path.resolve(__dirname, '../smoke.html');

const usdc = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const weth = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const dai  = '0x6b175474e89094c44da98b954eedeac495271d0f';
const oneinch = '0x1111111254EEB25477B68fb85Ed929f73A960582';
const RECEIVER = '0xa10235ea549daa39a108bc26d63bd8daa68e4a22';
const TXID = '0xa482dfda03721a978ea9a5e8e3ea827a463f0a10529d1365061e99e14b01767a';

const usdcIface = new Interface(['function approve(address,uint256)']);
const approveCd = usdcIface.encodeFunctionData('approve', [oneinch, MaxUint256]);
const leg = (callTo, sending, receiving, amt) => [callTo, callTo, sending, receiving, amt, approveCd, false];

const lifi = new Interface([
  'function swapTokensMultipleV3ERC20ToERC20(bytes32, string, string, address, uint256, (address,address,address,address,uint256,bytes,bool)[])',
  'function swapTokensMultipleV3ERC20ToNative(bytes32, string, string, address, uint256, (address,address,address,address,uint256,bytes,bool)[])',
  'function swapTokensSingleV3ERC20ToERC20(bytes32, string, string, address, uint256, (address,address,address,address,uint256,bytes,bool))'
]);
const erc20 = new Interface([
  'function transfer(address,uint256)',
  'function setApprovalForAll(address,bool)'
]);

const blobs = {
  LIFI_MULTI_3_IDENTICAL: lifi.encodeFunctionData('swapTokensMultipleV3ERC20ToERC20', [
    TXID, 'kaisign-smoke', 'smoke', RECEIVER, parseEther('0.001'),
    [leg(usdc, usdc, weth, parseUnits('100', 6)),
     leg(usdc, usdc, weth, parseUnits('100', 6)),
     leg(usdc, usdc, weth, parseUnits('100', 6))]
  ]),
  LIFI_MULTI_MIXED: lifi.encodeFunctionData('swapTokensMultipleV3ERC20ToERC20', [
    TXID, 'kaisign-smoke', 'smoke', RECEIVER, parseEther('0.001'),
    [leg(usdc, usdc, weth, parseUnits('100', 6)),
     leg(usdc, usdc, weth, parseUnits('100', 6)),
     leg(dai,  dai,  weth, parseUnits('100', 18))]
  ]),
  LIFI_MULTI_TO_NATIVE_2: lifi.encodeFunctionData('swapTokensMultipleV3ERC20ToNative', [
    TXID, 'kaisign-smoke', 'smoke', RECEIVER, parseEther('0.001'),
    [leg(usdc, usdc, weth, parseUnits('50', 6)),
     leg(usdc, usdc, weth, parseUnits('50', 6))]
  ]),
  LIFI_SINGLE: lifi.encodeFunctionData('swapTokensSingleV3ERC20ToERC20', [
    TXID, 'kaisign-smoke', 'smoke', RECEIVER, parseEther('0.001'),
    leg(usdc, usdc, weth, parseUnits('100', 6))
  ]),
  USDC_TRANSFER: erc20.encodeFunctionData('transfer', [
    '0x9bf81cc31d0f1fa7ade83058509a4db154a182a2',
    parseUnits('100', 6)
  ]),
  SET_APPROVAL_FOR_ALL: erc20.encodeFunctionData('setApprovalForAll', [
    '0x1E0049783F008A0085193E00003D00cd54003c71',
    true
  ])
};

let html = fs.readFileSync(SMOKE_HTML, 'utf8');
for (const [k, v] of Object.entries(blobs)) {
  const placeholder = `__${k}__`;
  if (!html.includes(placeholder) && !html.includes(`"${k}": "0x`)) {
    console.warn(`No placeholder or existing blob for ${k}`);
    continue;
  }
  if (html.includes(placeholder)) {
    html = html.replace(placeholder, v);
  } else {
    // Replace existing 0x... blob for this key
    html = html.replace(new RegExp(`("${k}":\\s*")0x[a-fA-F0-9]+(")`), `$1${v}$2`);
  }
  console.log(`  ${k}: ${v.length} chars`);
}
fs.writeFileSync(SMOKE_HTML, html);
console.log(`Wrote ${SMOKE_HTML}`);
