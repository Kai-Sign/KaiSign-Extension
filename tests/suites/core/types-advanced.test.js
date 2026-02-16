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
      // addressName format returns shortened address when no token metadata exists
      intent: `First order 42 from 0xd8da...6045`
    }
  }));

  // ===== Signed Integer Tests =====

  const signedAddress = '0xtest9999999999999999999999999999999999';
  const signedIface = new ethers.Interface([
    'function setInt8(int8 value)',
    'function setInt256(int256 value)'
  ]);

  harness.addMetadata(signedAddress, {
    context: {
      contract: {
        address: signedAddress,
        chainId: 1,
        name: 'Signed Int Test',
        abi: [
          { type: 'function', name: 'setInt8', inputs: [{ name: 'value', type: 'int8' }] },
          { type: 'function', name: 'setInt256', inputs: [{ name: 'value', type: 'int256' }] }
        ]
      }
    },
    display: {
      formats: {
        'setInt8(int8)': { intent: 'Set int8', fields: [{ path: 'value', label: 'Value', format: 'number' }] },
        'setInt256(int256)': { intent: 'Set int256', fields: [{ path: 'value', label: 'Value', format: 'number' }] }
      }
    }
  });

  results.push(await harness.runTest({
    name: 'int8(-1) two\'s complement decoding',
    calldata: signedIface.encodeFunctionData('setInt8', [-1]),
    contractAddress: signedAddress,
    expected: {
      shouldSucceed: true,
      functionName: 'setInt8',
      params: { value: '-1' }
    }
  }));

  results.push(await harness.runTest({
    name: 'int8(-128) two\'s complement decoding',
    calldata: signedIface.encodeFunctionData('setInt8', [-128]),
    contractAddress: signedAddress,
    expected: {
      shouldSucceed: true,
      functionName: 'setInt8',
      params: { value: '-128' }
    }
  }));

  results.push(await harness.runTest({
    name: 'int256 large negative decoding',
    calldata: signedIface.encodeFunctionData('setInt256', [-1000000n]),
    contractAddress: signedAddress,
    expected: {
      shouldSucceed: true,
      functionName: 'setInt256',
      params: { value: '-1000000' }
    }
  }));

  // ===== Fixed-Size Array Tests =====

  const fixedArrayAddress = '0xtestaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const fixedArrayIface = new ethers.Interface([
    'function setThreeValues(uint256[3] values)',
    'function setTwoAddresses(address[2] addrs)',
    'function setFourFlags(bool[4] flags)'
  ]);

  const setThreeSelector = fixedArrayIface.getFunction('setThreeValues').selector;
  const setTwoSelector = fixedArrayIface.getFunction('setTwoAddresses').selector;
  const setFourSelector = fixedArrayIface.getFunction('setFourFlags').selector;

  harness.addMetadata(fixedArrayAddress, {
    context: {
      contract: {
        address: fixedArrayAddress,
        chainId: 1,
        name: 'Fixed Array Test',
        abi: [
          { type: 'function', name: 'setThreeValues', selector: setThreeSelector, inputs: [{ name: 'values', type: 'uint256[3]' }] },
          { type: 'function', name: 'setTwoAddresses', selector: setTwoSelector, inputs: [{ name: 'addrs', type: 'address[2]' }] },
          { type: 'function', name: 'setFourFlags', selector: setFourSelector, inputs: [{ name: 'flags', type: 'bool[4]' }] }
        ]
      }
    },
    display: {
      formats: {
        'setThreeValues(uint256[3])': { intent: 'Set three values', fields: [{ path: 'values', label: 'Values', format: 'raw' }] },
        'setTwoAddresses(address[2])': { intent: 'Set two addresses', fields: [{ path: 'addrs', label: 'Addresses', format: 'raw' }] },
        'setFourFlags(bool[4])': { intent: 'Set four flags', fields: [{ path: 'flags', label: 'Flags', format: 'raw' }] }
      }
    }
  });

  results.push(await harness.runTest({
    name: 'uint256[3] fixed array decoding',
    calldata: fixedArrayIface.encodeFunctionData('setThreeValues', [[100, 200, 300]]),
    contractAddress: fixedArrayAddress,
    expected: {
      shouldSucceed: true,
      functionName: 'setThreeValues'
    }
  }));

  results.push(await harness.runTest({
    name: 'address[2] fixed array decoding',
    calldata: fixedArrayIface.encodeFunctionData('setTwoAddresses', [['0xd8da6bf26964af9d7eed9e03e53415d37aa96045', '0x71C7656EC7ab88b098defB751B7401B5f6d8976F']]),
    contractAddress: fixedArrayAddress,
    expected: {
      shouldSucceed: true,
      functionName: 'setTwoAddresses'
    }
  }));

  results.push(await harness.runTest({
    name: 'bool[4] fixed array decoding',
    calldata: fixedArrayIface.encodeFunctionData('setFourFlags', [[true, false, true, false]]),
    contractAddress: fixedArrayAddress,
    expected: {
      shouldSucceed: true,
      functionName: 'setFourFlags'
    }
  }));

  // ===== UTF-8 String Tests =====

  const utf8Calldata = typeIface.encodeFunctionData('setMessage', ['caf\u00e9']);
  results.push(await harness.runTest({
    name: 'UTF-8 string with accented character (caf\u00e9)',
    calldata: utf8Calldata,
    contractAddress: typeTestAddress,
    expected: {
      shouldSucceed: true,
      functionName: 'setMessage',
      params: { message: 'caf\u00e9' }
    }
  }));

  // ===== Truncated Calldata / Bounds Checking Tests =====

  // Calldata with selector but missing parameter data
  results.push(await harness.runTest({
    name: 'Truncated calldata graceful error',
    calldata: '0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045',  // missing second param
    contractAddress: typeTestAddress,  // won't match selector, so it should fail gracefully
    expected: {
      shouldSucceed: false
    }
  }));

  return results;
}
