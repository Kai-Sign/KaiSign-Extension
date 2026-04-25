/**
 * Decoder noFormat marker test.
 *
 * Verifies that when the decoder ABI-decodes a call but no curated ERC-7730
 * display.formats entry exists, the result carries:
 *   - intent === 'Contract interaction' (legacy string preserved for the
 *     verified-abi-coverage suite's "selectorsNoFormat" bucket)
 *   - noFormat === true
 *   - function === '<name>(<types>)' so the popup can render
 *     "Function call: <signature>" instead of the ambiguous default.
 */

export async function runTests(harness) {
  const results = [];

  const record = (result) => {
    results.push(result);
    if (harness?.stats) {
      if (result.passed) harness.stats.passed++;
      else harness.stats.failed++;
    }
  };

  const addr = '0x1234567890123456789012345678901234567890';
  harness.addMetadata(addr, {
    context: {
      contract: {
        address: addr,
        chainId: 1,
        name: 'NoFormatContract',
        abi: [
          {
            type: 'function',
            name: 'setApprovalForAll',
            selector: '0xa22cb465',
            inputs: [
              { name: 'operator', type: 'address' },
              { name: 'approved', type: 'bool' }
            ]
          }
        ]
      }
    },
    display: { formats: {} }
  });

  const calldata = '0xa22cb465000000000000000000000000deaddeaddeaddeaddeaddeaddeaddeaddeaddead0000000000000000000000000000000000000000000000000000000000000001';
  const decoded = await harness.decoders.decodeCalldata(calldata, addr, 1);

  const baseResult = (name, passed, error = null) => ({
    name,
    passed,
    duration: 0,
    result: null,
    expected: {},
    error,
    skipped: false
  });

  record(baseResult(
    'noFormat marker: intent stays "Contract interaction" (verified-abi-coverage compat)',
    decoded.intent === 'Contract interaction',
    decoded.intent === 'Contract interaction' ? null : `expected "Contract interaction", got ${JSON.stringify(decoded.intent)}`
  ));

  record(baseResult(
    'noFormat marker: noFormat flag is true for ABI-decoded call without display.formats',
    decoded.noFormat === true,
    decoded.noFormat === true ? null : `expected noFormat=true, got ${JSON.stringify(decoded.noFormat)}`
  ));

  record(baseResult(
    'noFormat marker: function signature exposed for popup "Function call: <sig>" rendering',
    decoded.function === 'setApprovalForAll(address,bool)',
    decoded.function === 'setApprovalForAll(address,bool)' ? null : `expected "setApprovalForAll(address,bool)", got ${JSON.stringify(decoded.function)}`
  ));

  return results;
}
