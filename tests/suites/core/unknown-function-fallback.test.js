export async function runTests(harness) {
  const results = [];

  results.push(await harness.runTest({
    name: 'Known selector on unknown contract decodes approve params',
    calldata: '0x095ea7b3000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa960451111111111111111111111111111111111111111111111111111111111111111',
    contractAddress: '0x1234567890abcdef1234567890abcdef12345678',
    expected: {
      shouldSucceed: false,
      selector: '0x095ea7b3',
      intent: 'Approve 0x1111111111111111111111111111111111111111111111111111111111111111 to 0xd8da...6045',
      intentDoesNotContain: 'Unknown',
      params: {
        spender: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
        amount: '7719472615821079694904732333912527190217998977709370935963838933860875309329'
      }
    }
  }));

  harness.addTokenMetadata('0x1234567890abcdef1234567890abcdef12345679', {
    address: '0x1234567890abcdef1234567890abcdef12345679',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    hasMetadata: true
  });

  results.push(await harness.runTest({
    name: 'Known ERC-20 selector without contract metadata still synthesizes transfer intent',
    calldata: '0xa9059cbb0000000000000000000000009bf81cc31d0f1fa7ade83058509a4db154a182a20000000000000000000000000000000000000000000000000000000005f5e100',
    contractAddress: '0x1234567890abcdef1234567890abcdef12345679',
    expected: {
      shouldSucceed: false,
      selector: '0xa9059cbb',
      intentContains: 'Transfer 100.00 USDC',
      intentDoesNotContain: 'Unknown'
    }
  }));

  harness.addMetadata('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', {
    context: {
      contract: {
        address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        chainId: 1,
        name: 'USD Coin',
        abi: [
          {
            type: 'function',
            name: 'approve',
            selector: '0x095ea7b3',
            inputs: [
              { name: 'spender', type: 'address' },
              { name: 'amount', type: 'uint256' }
            ]
          }
        ]
      }
    },
    display: {
      formats: {
        'approve(address,uint256)': {
          intent: 'Approve {amount}',
          fields: [
            { path: 'spender', label: 'Spender', format: 'addressOrName' },
            { path: 'amount', label: 'Amount', format: 'amount', params: { decimals: 6, symbol: 'USDC' } }
          ]
        }
      }
    }
  });

  results.push(await harness.runTest({
    name: 'Unknown selector on known contract keeps unknown intent',
    calldata: '0xdeadbeef000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045',
    contractAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    expected: {
      shouldSucceed: false,
      selector: '0xdeadbeef',
      intent: 'Unknown function on USD Coin'
    }
  }));

  harness.addMetadata('0xa238dd80c259a72e81d7e4664a9801593f98d1c5', {
    context: {
      contract: {
        address: '0xa238dd80c259a72e81d7e4664a9801593f98d1c5',
        chainId: 8453,
        name: 'Aave V3 Pool (Base)',
        abi: [
          {
            type: 'function',
            name: 'withdraw',
            selector: '0x69328dec',
            inputs: [
              { name: 'asset', type: 'address' },
              { name: 'amount', type: 'uint256' },
              { name: 'to', type: 'address' }
            ]
          }
        ]
      }
    },
    display: {
      formats: {
        'withdraw(address,uint256,address)': {
          intent: 'Withdraw {amount} from Aave',
          fields: [
            { path: 'asset', label: 'Asset', format: 'addressOrName' },
            { path: 'amount', label: 'Amount', format: 'tokenAmount', params: { tokenPath: 'asset' } },
            { path: 'to', label: 'Recipient', format: 'addressOrName' }
          ]
        }
      }
    }
  }, 8453);

  harness.addTokenMetadata('0x04c0599ae5a44757c0af6f9ec3b93da8976c150a', {
    address: '0x04c0599ae5a44757c0af6f9ec3b93da8976c150a',
    symbol: '',
    name: 'Wrapped eETH',
    decimals: null
  }, 8453);

  results.push(await harness.runTest({
    name: 'MAX_UINT256 tokenAmount without decimals shows unlimited',
    calldata: '0x69328dec00000000000000000000000004c0599ae5a44757c0af6f9ec3b93da8976c150affffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff000000000000000000000000638252f8b5977b5a870756955164319fc9dadf5b',
    contractAddress: '0xa238dd80c259a72e81d7e4664a9801593f98d1c5',
    chainId: 8453,
    expected: {
      shouldSucceed: true,
      intentContains: 'Withdraw unlimited',
      intentDoesNotContain: '115792089'
    }
  }));

  return results;
}
