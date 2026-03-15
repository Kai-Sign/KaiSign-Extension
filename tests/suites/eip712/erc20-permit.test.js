/**
 * ERC-20 Permit (EIP-2612) Tests
 *
 * Tests EIP-712 wildcard domain matching: verifyingContract is "*" in metadata,
 * meaning the same Permit format should match ANY ERC-20 token contract.
 */

import { loadMetadata } from '../../lib/metadata-loader.js';

export async function runTests(harness) {
  const results = [];

  // ERC-20 Permit metadata uses wildcard domain — load with a specific USDC address
  const usdcAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
  harness.addMetadata(usdcAddress, loadMetadata('eip712/erc20-permit.json'));

  // Test 1: Standard ERC-20 Permit signature
  results.push(await harness.runEIP712Test({
    name: 'ERC-20 Permit signature (wildcard domain)',
    typedData: {
      domain: {
        name: 'USD Coin',
        version: '2',
        chainId: 1,
        verifyingContract: usdcAddress
      },
      primaryType: 'Permit',
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' }
        ],
        Permit: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' }
        ]
      },
      message: {
        owner: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
        spender: '0x111111125421ca6dc452d289314280a0f8842a65',
        value: '100000000', // 100 USDC
        nonce: '0',
        deadline: '1735689600'
      }
    },
    expected: {
      shouldSucceed: true,
      primaryType: 'Permit',
      intentContains: 'Approve',
      hasFields: ['owner', 'spender', 'value', 'nonce', 'deadline']
    }
  }));

  // Test 2: Unlimited permit (max uint256 value)
  results.push(await harness.runEIP712Test({
    name: 'ERC-20 Permit unlimited approval (max uint256)',
    typedData: {
      domain: {
        name: 'USD Coin',
        version: '2',
        chainId: 1,
        verifyingContract: usdcAddress
      },
      primaryType: 'Permit',
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' }
        ],
        Permit: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' }
        ]
      },
      message: {
        owner: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
        spender: '0x111111125421ca6dc452d289314280a0f8842a65',
        value: '115792089237316195423570985008687907853269984665640564039457584007913129639935', // max uint256
        nonce: '1',
        deadline: '1735689600'
      }
    },
    expected: {
      shouldSucceed: true,
      primaryType: 'Permit',
      hasFields: ['value']
    }
  }));

  // Test 3: Permit on a different token (DAI) — tests wildcard matching
  const daiAddress = '0x6b175474e89094c44da98b954eedeac495271d0f';
  harness.addMetadata(daiAddress, loadMetadata('eip712/erc20-permit.json'));

  results.push(await harness.runEIP712Test({
    name: 'ERC-20 Permit on different token (DAI)',
    typedData: {
      domain: {
        name: 'Dai Stablecoin',
        version: '1',
        chainId: 1,
        verifyingContract: daiAddress
      },
      primaryType: 'Permit',
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' }
        ],
        Permit: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' }
        ]
      },
      message: {
        owner: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
        spender: '0x9008D19f58AAbD9eD0D60971565AA8510560ab41',
        value: '1000000000000000000000', // 1000 DAI
        nonce: '5',
        deadline: '1735689600'
      }
    },
    expected: {
      shouldSucceed: true,
      primaryType: 'Permit',
      intentContains: 'Approve'
    }
  }));

  return results;
}
