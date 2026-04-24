import { validateDecodedResultForAbiStructure } from '../../lib/clear-sign-readiness.js';

function buildResult(name, passed, error = null, result = null) {
  return {
    name,
    passed,
    duration: 0,
    result,
    expected: {},
    error,
    skipped: false
  };
}

export async function runTests() {
  const results = [];

  const transferAbi = {
    name: 'transfer',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' }
    ]
  };

  const validTransfer = {
    success: true,
    functionName: 'transfer',
    params: {
      to: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
      value: '1000000'
    },
    rawParams: {
      to: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
      value: { _isBigNumber: true, _hex: '0x0f4240', _value: '1000000' }
    }
  };

  {
    const readiness = validateDecodedResultForAbiStructure(validTransfer, transferAbi);
    results.push(buildResult(
      'ABI structure accepts resolved primitive params',
      readiness.ok,
      readiness.ok ? null : readiness.issues.join('; '),
      validTransfer
    ));
  }

  {
    const invalid = {
      ...validTransfer,
      rawParams: {
        to: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045'
      }
    };
    const readiness = validateDecodedResultForAbiStructure(invalid, transferAbi);
    results.push(buildResult(
      'ABI structure rejects missing raw fields',
      !readiness.ok,
      readiness.ok ? 'validator should reject missing typed fields' : null,
      invalid
    ));
  }

  const tupleAbi = {
    name: 'submitOrder',
    inputs: [
      {
        name: 'order',
        type: 'tuple',
        components: [
          { name: 'maker', type: 'address' },
          { name: 'amount', type: 'uint256' }
        ]
      }
    ]
  };

  {
    const invalid = {
      success: true,
      functionName: 'submitOrder',
      params: {
        order: '[object Object]'
      },
      rawParams: {
        order: '[object Object]'
      }
    };
    const readiness = validateDecodedResultForAbiStructure(invalid, tupleAbi);
    results.push(buildResult(
      'ABI structure rejects collapsed structured params',
      !readiness.ok,
      readiness.ok ? 'validator should reject structured params that collapsed to [object Object]' : null,
      invalid
    ));
  }

  return results;
}
