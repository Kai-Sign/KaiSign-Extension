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
import { loadMetadata } from '../../lib/metadata-loader.js';

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
      functionName: 'transfer',
      intent: 'Transfer 0.10 USDC',
      intentContains: '0.10'
    }
  }));

  results.push(await harness.runTest({
    name: 'ERC-20 approve selector',
    calldata: '0x095ea7b3000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    contractAddress: usdcAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x095ea7b3',
      functionName: 'approve',
      intent: 'Approve Unlimited USDC',
      intentContains: 'Unlimited',
      intentDoesNotContain: '115792089'  // Should NOT show raw max uint256
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

  // 2.0 USDC = 2000000 (6 decimals)
  results.push(await harness.runTest({
    name: 'Token amount formatting (6 decimals)',
    calldata: '0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa9604500000000000000000000000000000000000000000000000000000000001e8480',
    contractAddress: '0xtest6666666666666666666666666666666666',
    expected: {
      shouldSucceed: true,
      intent: 'Transfer 2.00 USDC',
      intentContains: '2.00'
    }
  }));

  // ===== Unlimited Approval Detection =====

  results.push(await harness.runTest({
    name: 'Unlimited approval detection (max uint256)',
    calldata: '0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    contractAddress: '0xtest6666666666666666666666666666666666',
    expected: {
      shouldSucceed: true,
      intent: 'Transfer Unlimited USDC',
      intentContains: 'Unlimited',
      intentDoesNotContain: '115792089'  // Should NOT show raw max uint256
    }
  }));

  // ===== Duplicate Symbol Prevention =====
  // Test that intents like "Approve {amount} USDC" with formatted value "0.50 USDC"
  // do NOT produce "Approve 0.50 USDC USDC"
  // Uses the ACTUAL usdc.json fixture file to test real-world metadata

  const realUsdcAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
  harness.addMetadata(realUsdcAddress, loadMetadata('tokens/usdc.json'));

  // 0.10 USDC = 100000 (6 decimals)
  results.push(await harness.runTest({
    name: 'No duplicate symbol in intent (real USDC fixture)',
    calldata: '0x095ea7b3000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa9604500000000000000000000000000000000000000000000000000000000000186a0',  // 100000 = 0.10 USDC
    contractAddress: realUsdcAddress,
    expected: {
      shouldSucceed: true,
      intent: 'Approve 0.10 USDC',
      intentDoesNotContain: 'USDC USDC'  // Should NOT have duplicate symbol
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

  harness.addMetadata('0xaf88d065e77c8cc2239327c5edb3a432268e5831', {
    context: {
      contract: {
        address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
        chainId: 42161,
        name: 'USD Coin',
        symbol: 'USDC',
        decimals: 6,
        abi: []
      }
    },
    metadata: {
      name: 'USD Coin',
      symbol: 'USDC',
      decimals: 6
    },
    display: {
      formats: {}
    }
  }, 42161);

  results.push(await harness.runTest({
    name: 'Unknown contract fallback builds compact summary',
    calldata: '0xd7a08473000000000000000000000000af88d065e77c8cc2239327c5edb3a432268e5831000000000000000000000000000000000000000000000000000000007567665f0000000000000000000000000000000000000000000000000000000069b753f6000000000000000000000000000000000000000000000000000000000000001c5616e2efaf1c91c3cf5834537d93262701cc21e70acaf82a37961d52c24d44c136bb331e5b6d990ff095913f09834e2bc7c1e5ead0fa5e9df34bdc89f0245b7000000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000384a1f1ce43000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000002000e6c4dab6b27f918bf16a6ee49078344a4a2a3bad57f95bbcf4815b3dc42f89d000000000000000000000000000000000000000000000000000000000000014000000000000000000000000000000000000000000000000000000000000001800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000af88d065e77c8cc2239327c5edb3a432268e5831000000000000000000000000638252f8b5977b5a870756955164319fc9dadf5b000000000000000000000000000000000000000000000000000000007567665f00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000066163726f73730000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000f6a756d7065722e65786368616e67650000000000000000000000000000000000000000000000000000000000638252f8b5977b5a870756955164319fc9dadf5b000000000000000000000000638252f8b5977b5a870756955164319fc9dadf5b000000000000000000000000af88d065e77c8cc2239327c5edb3a432268e5831000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb480000000000000000000000000000000000000000000000000000000075632a990000000000000000000000000000000000000000000000000de03698027d527300000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000069b74cc70000000000000000000000000000000000000000000000000000000069b7703500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000160000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
    contractAddress: '0x89c634e7f4c8f5f2b785a27c79c1d7f6a6f3f818',
    chainId: 42161,
    expected: {
      shouldSucceed: false,
      selector: '0xd7a08473',
      intent: 'Unknown call 0xd7a08473',
      unknownSummary: {
        selector: '0xd7a08473',
        addressCountMin: 4,
        tokenHintsContain: ['USDC'],
        linesContain: ['Selector: 0xd7a08473', 'Address refs:', 'Time bounds:']
      }
    }
  }));

  results.push(await harness.runTest({
    name: 'Unknown function on known contract keeps compact summary',
    calldata: '0xdeadbeef000000000000000000000000af88d065e77c8cc2239327c5edb3a432268e5831000000000000000000000000638252f8b5977b5a870756955164319fc9dadf5b0000000000000000000000000000000000000000000000000000000069b753f6',
    contractAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
    chainId: 42161,
    expected: {
      shouldSucceed: false,
      selector: '0xdeadbeef',
      intent: 'Unknown function on USD Coin',
      unknownSummary: {
        selector: '0xdeadbeef',
        addressCountMin: 2,
        tokenHintsContain: ['USDC'],
        linesContain: ['Selector: 0xdeadbeef', 'Address refs:']
      }
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
