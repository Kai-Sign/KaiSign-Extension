/**
 * 1inch Limit Order EIP-712 Tests
 *
 * Tests 1inch limit order signature with makerAsset, takerAsset, amounts.
 */

import { loadMetadata } from '../../lib/metadata-loader.js';

export async function runTests(harness) {
  const results = [];

  const oneInchAddress = '0x111111125421ca6dc452d289314280a0f8842a65';
  harness.addMetadata(oneInchAddress, loadMetadata('eip712/1inch-limit-order.json'));

  // Test 1: Standard 1inch limit order
  results.push(await harness.runEIP712Test({
    name: '1inch Limit Order signature',
    typedData: {
      domain: {
        name: '1inch Aggregation Router',
        version: '6',
        chainId: 1,
        verifyingContract: '0x111111125421cA6dc452d289314280a0f8842A65'
      },
      primaryType: 'Order',
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' }
        ],
        Order: [
          { name: 'salt', type: 'uint256' },
          { name: 'makerAsset', type: 'address' },
          { name: 'takerAsset', type: 'address' },
          { name: 'maker', type: 'address' },
          { name: 'receiver', type: 'address' },
          { name: 'allowedSender', type: 'address' },
          { name: 'makingAmount', type: 'uint256' },
          { name: 'takingAmount', type: 'uint256' },
          { name: 'offsets', type: 'uint256' },
          { name: 'interactions', type: 'bytes' }
        ]
      },
      message: {
        salt: '1234567890',
        makerAsset: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',  // WETH
        takerAsset: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',  // USDC
        maker: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
        receiver: '0x0000000000000000000000000000000000000000',
        allowedSender: '0x0000000000000000000000000000000000000000',
        makingAmount: '1000000000000000000', // 1 WETH
        takingAmount: '2500000000',           // 2500 USDC
        offsets: '0',
        interactions: '0x'
      }
    },
    expected: {
      shouldSucceed: true,
      primaryType: 'Order',
      intentContains: '1inch',
      hasFields: ['makerAsset', 'takerAsset', 'makingAmount', 'takingAmount']
    }
  }));

  // Test 2: Reverse direction order (selling USDC for WETH)
  results.push(await harness.runEIP712Test({
    name: '1inch Limit Order reverse direction',
    typedData: {
      domain: {
        name: '1inch Aggregation Router',
        version: '6',
        chainId: 1,
        verifyingContract: '0x111111125421cA6dc452d289314280a0f8842A65'
      },
      primaryType: 'Order',
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' }
        ],
        Order: [
          { name: 'salt', type: 'uint256' },
          { name: 'makerAsset', type: 'address' },
          { name: 'takerAsset', type: 'address' },
          { name: 'maker', type: 'address' },
          { name: 'receiver', type: 'address' },
          { name: 'allowedSender', type: 'address' },
          { name: 'makingAmount', type: 'uint256' },
          { name: 'takingAmount', type: 'uint256' },
          { name: 'offsets', type: 'uint256' },
          { name: 'interactions', type: 'bytes' }
        ]
      },
      message: {
        salt: '9876543210',
        makerAsset: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',  // USDC
        takerAsset: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',  // WETH
        maker: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
        receiver: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
        allowedSender: '0x0000000000000000000000000000000000000000',
        makingAmount: '5000000000',           // 5000 USDC
        takingAmount: '2000000000000000000', // 2 WETH
        offsets: '0',
        interactions: '0x'
      }
    },
    expected: {
      shouldSucceed: true,
      primaryType: 'Order',
      intentContains: '1inch'
    }
  }));

  return results;
}
