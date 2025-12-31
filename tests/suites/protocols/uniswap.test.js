/**
 * Uniswap Protocol Tests
 *
 * OFF-CHAIN ROUTING:
 * Uniswap Auto Router API computes optimal swap path and returns:
 *   - commands: Byte array where each byte is a command opcode
 *   - inputs[]: ABI-encoded parameters for each command
 *
 * COMMAND OPCODES (computed off-chain by Auto Router):
 *   0x00 = V3_SWAP_EXACT_IN      - Swap exact input on V3
 *   0x01 = V3_SWAP_EXACT_OUT     - Swap exact output on V3
 *   0x02 = PERMIT2_TRANSFER_FROM - Transfer via Permit2
 *   0x03 = PERMIT2_PERMIT_BATCH  - Batch permit
 *   0x04 = SWEEP                 - Sweep tokens to recipient
 *   0x05 = TRANSFER              - Transfer tokens
 *   0x06 = PAY_PORTION           - Pay portion of balance
 *   0x08 = V2_SWAP_EXACT_IN      - Swap exact input on V2
 *   0x09 = V2_SWAP_EXACT_OUT     - Swap exact output on V2
 *   0x0a = PERMIT2_PERMIT        - Single permit
 *   0x0b = WRAP_ETH              - Wrap ETH to WETH
 *   0x0c = UNWRAP_WETH           - Unwrap WETH to ETH
 *   0x0d = PERMIT2_TRANSFER_FROM_BATCH
 *
 * Example: commands = 0x0b00 means:
 *   [0] = 0x0b (WRAP_ETH) - First wrap ETH
 *   [1] = 0x00 (V3_SWAP_EXACT_IN) - Then swap on V3
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CONTRACTS, UNISWAP_COMMANDS } from '../../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Run Uniswap protocol tests
 */
export async function runTests(harness) {
  const results = [];

  // Load Uniswap transaction fixtures
  const commandsFile = path.resolve(__dirname, '../../fixtures/transactions/uniswap-commands.json');
  let commandTransactions = [];

  if (fs.existsSync(commandsFile)) {
    commandTransactions = JSON.parse(fs.readFileSync(commandsFile, 'utf8'));
  }

  // Add Universal Router metadata for testing
  const universalRouterAddress = CONTRACTS.dex.uniswapUniversalRouter.address.toLowerCase();

  // ERC-7730 compliant metadata with commandRegistries
  // Each command has its own intent template with parameter substitution

  harness.addMetadata(universalRouterAddress, {
    context: {
      contract: {
        address: universalRouterAddress,
        chainId: 1,
        name: 'Uniswap Universal Router',
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
    // Command registry defines each command's intent template
    commandRegistries: {
      universalRouterCommands: {
        '0x00': {
          name: 'V3_SWAP_EXACT_IN',
          intent: 'Swap {amountIn} for min {amountOutMin}',
          inputs: [
            { name: 'recipient', type: 'address' },
            { name: 'amountIn', type: 'uint256', format: 'tokenAmount' },
            { name: 'amountOutMin', type: 'uint256', format: 'tokenAmount' },
            { name: 'path', type: 'bytes' },
            { name: 'payerIsUser', type: 'bool' }
          ]
        },
        '0x01': {
          name: 'V3_SWAP_EXACT_OUT',
          intent: 'Swap for exactly {amountOut}',
          inputs: [
            { name: 'recipient', type: 'address' },
            { name: 'amountOut', type: 'uint256', format: 'tokenAmount' },
            { name: 'amountInMax', type: 'uint256', format: 'tokenAmount' },
            { name: 'path', type: 'bytes' },
            { name: 'payerIsUser', type: 'bool' }
          ]
        },
        '0x08': {
          name: 'V2_SWAP_EXACT_IN',
          intent: 'Swap {amountIn} via V2 for min {amountOutMin}',
          inputs: [
            { name: 'recipient', type: 'address' },
            { name: 'amountIn', type: 'uint256', format: 'tokenAmount' },
            { name: 'amountOutMin', type: 'uint256', format: 'tokenAmount' },
            { name: 'path', type: 'address[]' },
            { name: 'payerIsUser', type: 'bool' }
          ]
        },
        '0x0b': {
          name: 'WRAP_ETH',
          intent: 'Wrap {amountMin} to WETH',
          inputs: [
            { name: 'recipient', type: 'address' },
            { name: 'amountMin', type: 'uint256', format: 'ethAmount' }
          ]
        },
        '0x0c': {
          name: 'UNWRAP_WETH',
          intent: 'Unwrap {amountMin} to ETH',
          inputs: [
            { name: 'recipient', type: 'address' },
            { name: 'amountMin', type: 'uint256', format: 'ethAmount' }
          ]
        },
        '0x04': {
          name: 'SWEEP',
          intent: 'Sweep {token} to recipient',
          inputs: [
            { name: 'token', type: 'address', format: 'tokenSymbol' },
            { name: 'recipient', type: 'address' },
            { name: 'amountMin', type: 'uint256' }
          ]
        }
      }
    },
    display: {
      formats: {
        'execute(bytes,bytes[],uint256)': {
          // Composite intent built from decoded commands
          intent: {
            type: 'composite',
            source: 'commands',
            separator: ' + ',
            registry: 'universalRouterCommands'
          },
          fields: [
            {
              path: 'commands',
              label: 'Commands',
              nestedEncoding: {
                type: 'commandArray',
                registry: 'universalRouterCommands',
                decodeWith: 'inputs'
              }
            },
            { path: 'inputs', label: 'Inputs', format: 'hidden' },
            { path: 'deadline', label: 'Deadline', format: 'timestamp' }
          ]
        }
      }
    }
  });

  // Test: commands = 0x0b00 = [WRAP_ETH (0x0b), V3_SWAP_EXACT_IN (0x00)]
  // This is a typical ETH → Token swap: wrap ETH first, then swap
  results.push(await harness.runTest({
    name: 'Universal Router execute (WRAP_ETH + V3_SWAP)',
    calldata: '0x3593564c' +
      '0000000000000000000000000000000000000000000000000000000000000060' + // commands offset
      '00000000000000000000000000000000000000000000000000000000000000a0' + // inputs offset
      '0000000000000000000000000000000000000000000000000000000067680f80' + // deadline
      '0000000000000000000000000000000000000000000000000000000000000002' + // commands length
      '0b00000000000000000000000000000000000000000000000000000000000000' + // commands: [0x0b, 0x00] = WRAP_ETH, V3_SWAP
      '0000000000000000000000000000000000000000000000000000000000000002' + // inputs.length = 2
      '0000000000000000000000000000000000000000000000000000000000000040' + // inputs[0] offset
      '00000000000000000000000000000000000000000000000000000000000000c0' + // inputs[1] offset
      '0000000000000000000000000000000000000000000000000000000000000040' + // inputs[0] length
      '0000000000000000000000000000000000000000000000000000000000000002' + // WRAP_ETH: recipient
      '00000000000000000000000000000000000000000000000000005af3107a4000' + // WRAP_ETH: amountMin (0.001 ETH)
      '0000000000000000000000000000000000000000000000000000000000000040' + // inputs[1] length
      '0000000000000000000000000000000000000000000000000000000000000001' + // V3_SWAP: recipient
      '00000000000000000000000000000000000000000000000000005af3107a4000', // V3_SWAP: amountIn
    contractAddress: universalRouterAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x3593564c',
      functionName: 'execute',
      intentContains: 'Wrap' // Composite intent includes WRAP_ETH + V3_SWAP
    }
  }));

  // Test each COMMAND type from fetched transactions (if available)
  if (commandTransactions.length > 0) {
    console.log(`  Testing ${commandTransactions.length} real Uniswap COMMAND transactions`);

    for (const tx of commandTransactions) {
      results.push(await harness.runTest({
        name: tx.description || `Command ${tx.commandHex}`,
        calldata: tx.input,
        contractAddress: tx.to,
        expected: {
          shouldSucceed: true,
          selector: '0x3593564c',
          functionName: 'execute'
        }
      }));
    }
  }

  // Test Permit2 metadata
  const permit2Address = CONTRACTS.dex.permit2.address.toLowerCase();

  harness.addMetadata(permit2Address, {
    context: {
      contract: {
        address: permit2Address,
        chainId: 1,
        name: 'Permit2',
        abi: [
          {
            type: 'function',
            name: 'permit',
            selector: '0x2b67b570',
            inputs: [
              { name: 'owner', type: 'address' },
              {
                name: 'permitSingle',
                type: 'tuple',
                components: [
                  {
                    name: 'details',
                    type: 'tuple',
                    components: [
                      { name: 'token', type: 'address' },
                      { name: 'amount', type: 'uint160' },
                      { name: 'expiration', type: 'uint48' },
                      { name: 'nonce', type: 'uint48' }
                    ]
                  },
                  { name: 'spender', type: 'address' },
                  { name: 'sigDeadline', type: 'uint256' }
                ]
              },
              { name: 'signature', type: 'bytes' }
            ]
          },
          {
            type: 'function',
            name: 'permitTransferFrom',
            selector: '0x30f28b7a',
            inputs: [
              {
                name: 'permit',
                type: 'tuple',
                components: [
                  {
                    name: 'permitted',
                    type: 'tuple',
                    components: [
                      { name: 'token', type: 'address' },
                      { name: 'amount', type: 'uint256' }
                    ]
                  },
                  { name: 'nonce', type: 'uint256' },
                  { name: 'deadline', type: 'uint256' }
                ]
              },
              {
                name: 'transferDetails',
                type: 'tuple',
                components: [
                  { name: 'to', type: 'address' },
                  { name: 'requestedAmount', type: 'uint256' }
                ]
              },
              { name: 'owner', type: 'address' },
              { name: 'signature', type: 'bytes' }
            ]
          }
        ]
      }
    },
    display: {
      formats: {
        'permit(address,((address,uint160,uint48,uint48),address,uint256),bytes)': {
          intent: 'Approve token spending via Permit2',
          fields: []
        },
        'permitTransferFrom(((address,uint256),uint256,uint256),(address,uint256),address,bytes)': {
          intent: 'Transfer via Permit2 signature',
          fields: []
        }
      }
    }
  });

  // Test V3 Factory
  const v3FactoryAddress = CONTRACTS.dex.uniswapV3Factory.address.toLowerCase();

  harness.addMetadata(v3FactoryAddress, {
    context: {
      contract: {
        address: v3FactoryAddress,
        chainId: 1,
        name: 'Uniswap V3 Factory',
        abi: [{
          type: 'function',
          name: 'createPool',
          selector: '0xa1671295',
          inputs: [
            { name: 'tokenA', type: 'address' },
            { name: 'tokenB', type: 'address' },
            { name: 'fee', type: 'uint24' }
          ]
        }]
      }
    },
    display: {
      formats: {
        'createPool(address,address,uint24)': {
          intent: 'Create Uniswap V3 pool',
          fields: [
            { path: 'tokenA', label: 'Token A', format: 'address' },
            { path: 'tokenB', label: 'Token B', format: 'address' },
            { path: 'fee', label: 'Fee Tier', format: 'number' }
          ]
        }
      }
    }
  });

  results.push(await harness.runTest({
    name: 'V3 Factory createPool function',
    calldata: '0xa1671295' +
      '000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' + // USDC
      '000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' + // WETH
      '0000000000000000000000000000000000000000000000000000000000000bb8',  // 0.3% fee
    contractAddress: v3FactoryAddress,
    expected: {
      shouldSucceed: true,
      selector: '0xa1671295',
      functionName: 'createPool'
    }
  }));

  // Test Quoter V2
  const quoterAddress = CONTRACTS.dex.uniswapQuoterV2.address.toLowerCase();

  harness.addMetadata(quoterAddress, {
    context: {
      contract: {
        address: quoterAddress,
        chainId: 1,
        name: 'Uniswap Quoter V2',
        abi: [
          {
            type: 'function',
            name: 'quoteExactInputSingle',
            selector: '0xc6a5026a',
            inputs: [
              {
                name: 'params',
                type: 'tuple',
                components: [
                  { name: 'tokenIn', type: 'address' },
                  { name: 'tokenOut', type: 'address' },
                  { name: 'amountIn', type: 'uint256' },
                  { name: 'fee', type: 'uint24' },
                  { name: 'sqrtPriceLimitX96', type: 'uint160' }
                ]
              }
            ]
          }
        ]
      }
    },
    display: {
      formats: {
        'quoteExactInputSingle((address,address,uint256,uint24,uint160))': {
          intent: 'Quote exact input swap',
          fields: []
        }
      }
    }
  });

  return results;
}
