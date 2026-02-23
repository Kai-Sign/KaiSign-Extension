/**
 * CoW Protocol EIP-712 Order Signature Tests
 *
 * Tests decoding of off-chain Order signatures that users sign via eth_signTypedData_v4.
 * These are the typed data signatures users see when trading on CoW Swap.
 *
 * CoW Protocol flow:
 * 1. User signs Order typed data (EIP-712) - THIS IS WHAT WE'RE TESTING
 * 2. Order is submitted to CoW orderbook API
 * 3. Solvers compete to batch and execute orders
 * 4. Winning solver calls settle() on GPv2Settlement contract
 */

import { loadMetadata } from '../../lib/metadata-loader.js';

export async function runTests(harness) {
  const results = [];

  const cowSettlementAddress = '0x9008D19f58AAbD9eD0D60971565AA8510560ab41'.toLowerCase();

  // Only load local fixtures in local mode.
  // In remote mode, metadata must come from the API to verify backend deployment.
  if (!harness.config.useRemoteApi) {
    harness.addMetadata(cowSettlementAddress, loadMetadata('eip712/cow-gpv2-order.json'));
  }

  // Sample CoW Protocol Order typed data (what users sign on CoW Swap)
  const cowOrderTypedData = {
    domain: {
      name: "Gnosis Protocol",
      version: "v2",
      chainId: 1,
      verifyingContract: "0x9008D19f58AAbD9eD0D60971565AA8510560ab41"
    },
    primaryType: "Order",
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" }
      ],
      Order: [
        { name: "sellToken", type: "address" },
        { name: "buyToken", type: "address" },
        { name: "receiver", type: "address" },
        { name: "sellAmount", type: "uint256" },
        { name: "buyAmount", type: "uint256" },
        { name: "validTo", type: "uint32" },
        { name: "appData", type: "bytes32" },
        { name: "feeAmount", type: "uint256" },
        { name: "kind", type: "string" },
        { name: "partiallyFillable", type: "bool" },
        { name: "sellTokenBalance", type: "string" },
        { name: "buyTokenBalance", type: "string" }
      ]
    },
    message: {
      sellToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",  // WETH
      buyToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",   // USDC
      receiver: "0x0000000000000000000000000000000000000000",
      sellAmount: "1000000000000000000",  // 1 WETH
      buyAmount: "2500000000",             // 2500 USDC (min)
      validTo: 1735689600,                 // Unix timestamp
      appData: "0x0000000000000000000000000000000000000000000000000000000000000000",
      feeAmount: "0",
      kind: "sell",
      partiallyFillable: false,
      sellTokenBalance: "erc20",
      buyTokenBalance: "erc20"
    }
  };

  // Test 1: EIP-712 metadata lookup for Order signature
  results.push(await harness.runEIP712Test({
    name: 'CoW Protocol Order signature',
    typedData: cowOrderTypedData,
    expected: {
      shouldSucceed: true,
      primaryType: 'Order',
      intentContains: 'CoW Protocol',
      hasFields: ['sellToken', 'buyToken', 'sellAmount', 'buyAmount']
    }
  }));

  // Test 2: Buy order (swapping order direction)
  const buyOrderTypedData = {
    ...cowOrderTypedData,
    message: {
      ...cowOrderTypedData.message,
      kind: "buy",
      sellAmount: "3000000000",            // Max 3000 USDC to spend
      buyAmount: "1000000000000000000",    // Want exactly 1 WETH
      sellToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",  // USDC
      buyToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"    // WETH
    }
  };

  results.push(await harness.runEIP712Test({
    name: 'CoW Protocol Buy Order signature',
    typedData: buyOrderTypedData,
    expected: {
      shouldSucceed: true,
      primaryType: 'Order',
      intentContains: 'CoW Protocol'
    }
  }));

  // Test 3: Partially fillable order
  const partialOrderTypedData = {
    ...cowOrderTypedData,
    message: {
      ...cowOrderTypedData.message,
      partiallyFillable: true,
      sellAmount: "10000000000000000000",  // 10 WETH
      buyAmount: "25000000000"              // 25000 USDC minimum
    }
  };

  results.push(await harness.runEIP712Test({
    name: 'CoW Protocol Partial Fill Order',
    typedData: partialOrderTypedData,
    expected: {
      shouldSucceed: true,
      primaryType: 'Order',
      hasFields: ['partiallyFillable']
    }
  }));

  // Test 4: Unknown primaryType should still return metadata (without matchedFormat)
  const unknownTypedData = {
    domain: cowOrderTypedData.domain,
    primaryType: "UnknownType",
    types: {
      EIP712Domain: cowOrderTypedData.types.EIP712Domain,
      UnknownType: [
        { name: "value", type: "uint256" }
      ]
    },
    message: { value: "123" }
  };

  results.push(await harness.runEIP712Test({
    name: 'Unknown primaryType (no format match)',
    typedData: unknownTypedData,
    expected: {
      shouldSucceed: false  // No matching format for UnknownType
    }
  }));

  // Test 5: Gnosis Chain deployment (chainId 100)
  const gnosisOrderTypedData = {
    ...cowOrderTypedData,
    domain: {
      ...cowOrderTypedData.domain,
      chainId: 100
    },
    message: {
      ...cowOrderTypedData.message,
      sellToken: "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d",  // WXDAI on Gnosis
      buyToken: "0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83"    // USDC on Gnosis
    }
  };

  results.push(await harness.runEIP712Test({
    name: 'CoW Protocol Order on Gnosis Chain',
    typedData: gnosisOrderTypedData,
    expected: {
      shouldSucceed: true,
      primaryType: 'Order',
      intentContains: 'CoW Protocol'
    }
  }));

  return results;
}
