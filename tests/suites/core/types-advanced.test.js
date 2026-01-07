/**
 * Advanced Solidity Type Tests
 *
 * Expands coverage for dynamic types, fixed bytes, and ERC-7730 path handling.
 */

import { ethers } from 'ethers';

export async function runTests(harness) {
  const results = [];

  const typeTestAddress = '0xtest7777777777777777777777777777777777';
  const typeTestAbi = [
    {
      type: 'function',
      name: 'setMessage',
      inputs: [{ name: 'message', type: 'string' }]
    },
    {
      type: 'function',
      name: 'setData',
      inputs: [{ name: 'data', type: 'bytes' }]
    },
    {
      type: 'function',
      name: 'setFixed',
      inputs: [{ name: 'data', type: 'bytes4' }]
    },
    {
      type: 'function',
      name: 'setSmall',
      inputs: [{ name: 'value', type: 'uint8' }]
    },
    {
      type: 'function',
      name: 'setSigned',
      inputs: [{ name: 'value', type: 'int256' }]
    },
    {
      type: 'function',
      name: 'setFlag',
      inputs: [{ name: 'flag', type: 'bool' }]
    }
  ];

  harness.addMetadata(typeTestAddress, {
    context: {
      contract: {
        address: typeTestAddress,
        chainId: 1,
        name: 'Type Test Contract',
        abi: typeTestAbi
      }
    },
    display: {
      formats: {
        'setMessage(string)': {
          intent: 'Set message',
          fields: [{ path: 'message', label: 'Message', format: 'raw' }]
        },
        'setData(bytes)': {
          intent: 'Set data',
          fields: [{ path: 'data', label: 'Data', format: 'raw' }]
        },
        'setFixed(bytes4)': {
          intent: 'Set fixed bytes',
          fields: [{ path: 'data', label: 'Data', format: 'raw' }]
        },
        'setSmall(uint8)': {
          intent: 'Set small value',
          fields: [{ path: 'value', label: 'Value', format: 'number' }]
        },
        'setSigned(int256)': {
          intent: 'Set signed value',
          fields: [{ path: 'value', label: 'Value', format: 'number' }]
        },
        'setFlag(bool)': {
          intent: 'Set flag',
          fields: [{ path: 'flag', label: 'Flag', format: 'boolean' }]
        }
      }
    }
  });

  const typeIface = new ethers.Interface([
    'function setMessage(string message)',
    'function setData(bytes data)',
    'function setFixed(bytes4 data)',
    'function setSmall(uint8 value)',
    'function setSigned(int256 value)',
    'function setFlag(bool flag)'
  ]);

  results.push(await harness.runTest({
    name: 'String parameter decoding',
    calldata: typeIface.encodeFunctionData('setMessage', ['hello world']),
    contractAddress: typeTestAddress,
    expected: {
      shouldSucceed: true,
      functionName: 'setMessage',
      params: { message: 'hello world' }
    }
  }));

  results.push(await harness.runTest({
    name: 'Bytes parameter decoding (dynamic)',
    calldata: typeIface.encodeFunctionData('setData', ['0x1234']),
    contractAddress: typeTestAddress,
    expected: {
      shouldSucceed: true,
      functionName: 'setData',
      params: { data: '0x1234' }
    }
  }));

  results.push(await harness.runTest({
    name: 'Bytes4 parameter decoding',
    calldata: typeIface.encodeFunctionData('setFixed', ['0xdeadbeef']),
    contractAddress: typeTestAddress,
    expected: {
      shouldSucceed: true,
      functionName: 'setFixed',
      params: { data: '0xdeadbeef' }
    }
  }));

  results.push(await harness.runTest({
    name: 'Uint8 parameter decoding',
    calldata: typeIface.encodeFunctionData('setSmall', [7]),
    contractAddress: typeTestAddress,
    expected: {
      shouldSucceed: true,
      functionName: 'setSmall',
      params: { value: '7' }
    }
  }));

  results.push(await harness.runTest({
    name: 'Int256 parameter decoding (positive)',
    calldata: typeIface.encodeFunctionData('setSigned', [42]),
    contractAddress: typeTestAddress,
    expected: {
      shouldSucceed: true,
      functionName: 'setSigned',
      params: { value: '42' }
    }
  }));

  results.push(await harness.runTest({
    name: 'Boolean parameter decoding (true)',
    calldata: typeIface.encodeFunctionData('setFlag', [true]),
    contractAddress: typeTestAddress,
    expected: {
      shouldSucceed: true,
      functionName: 'setFlag',
      params: { flag: 'true' }
    }
  }));

  const batchAddress = '0xtest8888888888888888888888888888888888';
  const batchIface = new ethers.Interface([
    'function batchOrders((address maker,uint256 amount)[] orders)'
  ]);
  const batchSelector = batchIface.getFunction('batchOrders').selector;
  const batchAbi = [
    {
      type: 'function',
      name: 'batchOrders',
      selector: batchSelector,
      inputs: [
        {
          name: 'orders',
          type: 'tuple[]',
          components: [
            { name: 'maker', type: 'address' },
            { name: 'amount', type: 'uint256' }
          ]
        }
      ]
    }
  ];

  harness.addMetadata(batchAddress, {
    context: {
      contract: {
        address: batchAddress,
        chainId: 1,
        name: 'Batch Orders',
        abi: batchAbi
      }
    },
    display: {
      formats: {
        'batchOrders(tuple[])': {
          interpolatedIntent: 'First order {#.orders.[0].amount} from {#.orders.[0].maker}',
          fields: [
            { path: '#.orders.[0].amount', label: 'First Amount', format: 'raw' },
            { path: '#.orders.[0].maker', label: 'First Maker', format: 'addressName' }
          ]
        }
      }
    }
  });

  const makerAddress = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
  const batchCalldata = batchIface.encodeFunctionData('batchOrders', [[{
    maker: makerAddress,
    amount: 42
  }]]);

  results.push(await harness.runTest({
    name: 'ERC-7730 path resolution with array index',
    calldata: batchCalldata,
    contractAddress: batchAddress,
    expected: {
      shouldSucceed: true,
      functionName: 'batchOrders',
      intent: `First order 42 from ${makerAddress}`
    }
  }));

  return results;
}
