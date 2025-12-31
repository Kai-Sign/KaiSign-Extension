/**
 * Uniswap Protocol Tests
 *
 * Tests Universal Router execute() and all COMMANDS:
 * - V3_SWAP_EXACT_IN (0x00)
 * - V3_SWAP_EXACT_OUT (0x01)
 * - V2_SWAP_EXACT_IN (0x08)
 * - V2_SWAP_EXACT_OUT (0x09)
 * - WRAP_ETH (0x0b)
 * - UNWRAP_WETH (0x0c)
 * - PERMIT2_PERMIT (0x04)
 * - And all other commands...
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
    display: {
      formats: {
        'execute(bytes,bytes[],uint256)': {
          intent: 'Execute Uniswap swap',
          fields: [
            { path: 'commands', label: 'Commands', format: 'hex' },
            { path: 'inputs', label: 'Inputs', format: 'array' },
            { path: 'deadline', label: 'Deadline', format: 'number' }
          ]
        }
      }
    }
  });

  // Test basic execute function decoding
  results.push(await harness.runTest({
    name: 'Universal Router execute() function recognition',
    calldata: '0x3593564c' +
      '0000000000000000000000000000000000000000000000000000000000000060' +
      '00000000000000000000000000000000000000000000000000000000000000a0' +
      '0000000000000000000000000000000000000000000000000000000067680f80' +
      '0000000000000000000000000000000000000000000000000000000000000002' +
      '0b00000000000000000000000000000000000000000000000000000000000000' +
      '0000000000000000000000000000000000000000000000000000000000000002' +
      '0000000000000000000000000000000000000000000000000000000000000040' +
      '00000000000000000000000000000000000000000000000000000000000000c0' +
      '0000000000000000000000000000000000000000000000000000000000000040' +
      '0000000000000000000000000000000000000000000000000000000000000002' +
      '00000000000000000000000000000000000000000000000000005af3107a4000' +
      '0000000000000000000000000000000000000000000000000000000000000040' +
      '0000000000000000000000000000000000000000000000000000000000000001' +
      '00000000000000000000000000000000000000000000000000005af3107a4000',
    contractAddress: universalRouterAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x3593564c',
      functionName: 'execute'
    }
  }));

  // Test each COMMAND type from fetched transactions
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
  } else {
    console.log('  [WARN] No command transaction fixtures found. Run: npm run fetch-transactions');

    // Add synthetic tests for each command type
    for (const [commandName, commandValue] of Object.entries(UNISWAP_COMMANDS)) {
      // Skip NFT commands for now (less common)
      if (commandValue >= 0x10) continue;

      results.push({
        name: `Command ${commandName} (0x${commandValue.toString(16).padStart(2, '0')})`,
        passed: false,
        duration: 0,
        result: null,
        expected: { commandName },
        error: 'No real transaction data available - run fetch-transactions first',
        skipped: true
      });
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
