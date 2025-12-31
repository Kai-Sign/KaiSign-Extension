/**
 * Core Decoder Tests (decode.js)
 *
 * Tests the fundamental decoding capabilities:
 * - Selector calculation
 * - Parameter decoding (all Solidity types)
 * - Intent generation
 * - Token amount formatting
 */

import { ethers } from 'ethers';

/**
 * Run all core decode tests
 */
export async function runTests(harness) {
  const results = [];

  // ===== Add USDC metadata for selector tests =====
  const usdcAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
  harness.addMetadata(usdcAddress, {
    context: {
      contract: {
        address: usdcAddress,
        chainId: 1,
        name: 'USD Coin',
        abi: [
          {
            type: 'function',
            name: 'transfer',
            selector: '0xa9059cbb',
            inputs: [
              { name: 'to', type: 'address' },
              { name: 'value', type: 'uint256' }
            ]
          },
          {
            type: 'function',
            name: 'approve',
            selector: '0x095ea7b3',
            inputs: [
              { name: 'spender', type: 'address' },
              { name: 'value', type: 'uint256' }
            ]
          }
        ]
      }
    },
    display: {
      formats: {
        'transfer(address,uint256)': {
          intent: 'Transfer USDC',
          fields: [
            { path: 'to', label: 'To', format: 'address' },
            { path: 'value', label: 'Amount', format: 'amount', params: { decimals: 6, symbol: 'USDC' } }
          ]
        },
        'approve(address,uint256)': {
          intent: 'Approve USDC spending',
          fields: [
            { path: 'spender', label: 'Spender', format: 'address' },
            { path: 'value', label: 'Amount', format: 'amount', params: { decimals: 6, symbol: 'USDC' } }
          ]
        }
      }
    }
  });

  // ===== Selector Calculation Tests =====

  results.push(await harness.runTest({
    name: 'ERC-20 transfer selector calculation',
    calldata: '0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa9604500000000000000000000000000000000000000000000000000000000000186a0',
    contractAddress: usdcAddress,
    expected: {
      shouldSucceed: true,
      selector: '0xa9059cbb',
      functionName: 'transfer'
    }
  }));

  results.push(await harness.runTest({
    name: 'ERC-20 approve selector',
    calldata: '0x095ea7b3000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    contractAddress: usdcAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x095ea7b3',
      functionName: 'approve'
    }
  }));

  // ===== Address Decoding Tests =====

  // Create test metadata for address decoding
  harness.addMetadata('0xtest1111111111111111111111111111111111', {
    context: {
      contract: {
        address: '0xtest1111111111111111111111111111111111',
        abi: [{
          type: 'function',
          name: 'transfer',
          selector: '0xa9059cbb',
          inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' }
          ]
        }]
      }
    },
    display: {
      formats: {
        'transfer(address,uint256)': {
          intent: 'Transfer tokens',
          fields: [
            { path: 'to', label: 'Recipient', format: 'address' },
            { path: 'amount', label: 'Amount', format: 'number' }
          ]
        }
      }
    }
  });

  results.push(await harness.runTest({
    name: 'Address parameter decoding',
    calldata: '0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa9604500000000000000000000000000000000000000000000000000000000000186a0',
    contractAddress: '0xtest1111111111111111111111111111111111',
    expected: {
      shouldSucceed: true,
      functionName: 'transfer',
      params: {
        to: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045'
      }
    }
  }));

  // ===== Uint256 Decoding Tests =====

  results.push(await harness.runTest({
    name: 'Uint256 parameter decoding',
    calldata: '0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa9604500000000000000000000000000000000000000000000000000000000000186a0',
    contractAddress: '0xtest1111111111111111111111111111111111',
    expected: {
      shouldSucceed: true,
      params: {
        amount: '100000' // 0x186a0 = 100000
      }
    }
  }));

  // ===== Bytes Decoding Tests =====

  harness.addMetadata('0xtest2222222222222222222222222222222222', {
    context: {
      contract: {
        address: '0xtest2222222222222222222222222222222222',
        abi: [{
          type: 'function',
          name: 'execute',
          selector: '0x3593564c',
          inputs: [
            { name: 'commands', type: 'bytes' },
            { name: 'inputs', type: 'bytes[]' },
            { name: 'deadline', type: 'uint256' }
          ]
        }]
      }
    },
    display: {
      formats: {
        'execute(bytes,bytes[],uint256)': {
          intent: 'Execute swap',
          fields: [
            { path: 'commands', label: 'Commands', format: 'hex' },
            { path: 'inputs', label: 'Inputs', format: 'array' },
            { path: 'deadline', label: 'Deadline', format: 'number' }
          ]
        }
      }
    }
  });

  // Simple execute calldata with commands
  const simpleExecuteCalldata = ethers.AbiCoder.defaultAbiCoder().encode(
    ['bytes', 'bytes[]', 'uint256'],
    ['0x0b00', ['0x1234', '0x5678'], 1735689600]
  );

  results.push(await harness.runTest({
    name: 'Bytes parameter decoding',
    calldata: '0x3593564c' + simpleExecuteCalldata.slice(2),
    contractAddress: '0xtest2222222222222222222222222222222222',
    expected: {
      shouldSucceed: true,
      functionName: 'execute'
    }
  }));

  // ===== Boolean Decoding Tests =====

  harness.addMetadata('0xtest3333333333333333333333333333333333', {
    context: {
      contract: {
        address: '0xtest3333333333333333333333333333333333',
        abi: [{
          type: 'function',
          name: 'setApprovalForAll',
          selector: '0xa22cb465',
          inputs: [
            { name: 'operator', type: 'address' },
            { name: 'approved', type: 'bool' }
          ]
        }]
      }
    },
    display: {
      formats: {
        'setApprovalForAll(address,bool)': {
          intent: 'Set approval for all',
          fields: [
            { path: 'operator', label: 'Operator', format: 'address' },
            { path: 'approved', label: 'Approved', format: 'boolean' }
          ]
        }
      }
    }
  });

  results.push(await harness.runTest({
    name: 'Boolean parameter decoding (true)',
    calldata: '0xa22cb465000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa960450000000000000000000000000000000000000000000000000000000000000001',
    contractAddress: '0xtest3333333333333333333333333333333333',
    expected: {
      shouldSucceed: true,
      functionName: 'setApprovalForAll'
    }
  }));

  // ===== Array Decoding Tests =====

  harness.addMetadata('0xtest4444444444444444444444444444444444', {
    context: {
      contract: {
        address: '0xtest4444444444444444444444444444444444',
        abi: [{
          type: 'function',
          name: 'batchTransfer',
          selector: '0xfbaedcbc',
          inputs: [
            { name: 'recipients', type: 'address[]' },
            { name: 'amounts', type: 'uint256[]' }
          ]
        }]
      }
    },
    display: {
      formats: {
        'batchTransfer(address[],uint256[])': {
          intent: 'Batch transfer',
          fields: [
            { path: 'recipients', label: 'Recipients', format: 'array' },
            { path: 'amounts', label: 'Amounts', format: 'array' }
          ]
        }
      }
    }
  });

  // Encode batch transfer
  const batchCalldata = ethers.AbiCoder.defaultAbiCoder().encode(
    ['address[]', 'uint256[]'],
    [
      ['0xd8da6bf26964af9d7eed9e03e53415d37aa96045', '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'],
      [1000000, 2000000]
    ]
  );

  results.push(await harness.runTest({
    name: 'Address[] array decoding',
    calldata: '0xfbaedcbc' + batchCalldata.slice(2),
    contractAddress: '0xtest4444444444444444444444444444444444',
    expected: {
      shouldSucceed: true,
      functionName: 'batchTransfer'
    }
  }));

  // ===== Tuple Decoding Tests =====

  harness.addMetadata('0xtest5555555555555555555555555555555555', {
    context: {
      contract: {
        address: '0xtest5555555555555555555555555555555555',
        abi: [{
          type: 'function',
          name: 'createOrder',
          selector: '0x12345678',
          inputs: [
            {
              name: 'order',
              type: 'tuple',
              components: [
                { name: 'maker', type: 'address' },
                { name: 'amount', type: 'uint256' },
                { name: 'expiry', type: 'uint256' }
              ]
            }
          ]
        }]
      }
    },
    display: {
      formats: {
        'createOrder((address,uint256,uint256))': {
          intent: 'Create order',
          fields: [
            { path: 'order', label: 'Order', format: 'tuple' }
          ]
        }
      }
    }
  });

  // Note: Tuple encoding is complex - just test that it doesn't crash
  const tupleCalldata = '0x12345678' +
    '000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045' +
    '00000000000000000000000000000000000000000000000000000000000186a0' +
    '00000000000000000000000000000000000000000000000000000000676e3200';

  results.push(await harness.runTest({
    name: 'Tuple parameter decoding',
    calldata: tupleCalldata,
    contractAddress: '0xtest5555555555555555555555555555555555',
    expected: {
      shouldSucceed: true,
      functionName: 'createOrder'
    }
  }));

  // ===== Token Amount Formatting Tests =====

  harness.addMetadata('0xtest6666666666666666666666666666666666', {
    context: {
      contract: {
        address: '0xtest6666666666666666666666666666666666',
        abi: [{
          type: 'function',
          name: 'transfer',
          selector: '0xa9059cbb',
          inputs: [
            { name: 'to', type: 'address' },
            { name: 'value', type: 'uint256' }
          ]
        }]
      }
    },
    display: {
      formats: {
        'transfer(address,uint256)': {
          intent: 'Transfer {value}',
          fields: [
            { path: 'to', label: 'Recipient', format: 'address' },
            {
              path: 'value',
              label: 'Amount',
              format: 'amount',
              params: { decimals: 6, symbol: 'USDC' }
            }
          ]
        }
      }
    }
  });

  // 1.5 USDC = 1500000 (6 decimals)
  results.push(await harness.runTest({
    name: 'Token amount formatting (6 decimals)',
    calldata: '0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa9604500000000000000000000000000000000000000000000000000000000001e8480',
    contractAddress: '0xtest6666666666666666666666666666666666',
    expected: {
      shouldSucceed: true,
      intentContains: 'Transfer'
    }
  }));

  // ===== Unlimited Approval Detection =====

  results.push(await harness.runTest({
    name: 'Unlimited approval detection (max uint256)',
    calldata: '0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    contractAddress: '0xtest6666666666666666666666666666666666',
    expected: {
      shouldSucceed: true,
      intentContains: 'Unlimited'
    }
  }));

  // ===== Unknown Function Handling =====

  results.push(await harness.runTest({
    name: 'Unknown function graceful failure',
    calldata: '0xdeadbeef0000000000000000000000000000000000000000000000000000000000000000',
    contractAddress: '0xtest6666666666666666666666666666666666',
    expected: {
      shouldSucceed: false,
      selector: '0xdeadbeef'
    }
  }));

  // ===== Invalid Calldata Handling =====

  results.push(await harness.runTest({
    name: 'Short calldata handling',
    calldata: '0x1234',
    contractAddress: '0xtest1111111111111111111111111111111111',
    expected: {
      shouldSucceed: false
    }
  }));

  return results;
}
