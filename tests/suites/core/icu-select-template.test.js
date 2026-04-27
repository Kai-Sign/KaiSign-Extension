/**
 * ICU select-template intent test.
 *
 * ERC-7730 spec allows ICU MessageFormat in intent strings — most
 * commonly `select` to branch on a bool/enum parameter:
 *   "{approved, select, true {Approve all} other {Revoke approval for}} NFT"
 *
 * This suite covers the SUBSET we support:
 *   - {var, select, branch1 {arm1} branch2 {arm2} ... other {default}}
 *   - no nesting
 *   - no plural / choice forms
 *
 * Cases:
 *   1. bool=true picks the matching branch
 *   2. bool=false falls through to `other`
 *   3. bare {param} substitution still works (regression guard)
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

  const baseResult = (name, passed, error = null) => ({
    name,
    passed,
    duration: 0,
    result: null,
    expected: {},
    error,
    skipped: false
  });

  // setApprovalForAll(0xdead..., true) → approved=true branch
  const calldataApprove = '0xa22cb465000000000000000000000000deaddeaddeaddeaddeaddeaddeaddeaddeaddead0000000000000000000000000000000000000000000000000000000000000001';
  // setApprovalForAll(0xdead..., false) → other branch
  const calldataRevoke = '0xa22cb465000000000000000000000000deaddeaddeaddeaddeaddeaddeaddeaddeaddead0000000000000000000000000000000000000000000000000000000000000000';

  // --- Case 1 + 2: ICU select with bool branching ---
  const icuAddr = '0x1111111111111111111111111111111111111111';
  harness.addMetadata(icuAddr, {
    context: {
      contract: {
        address: icuAddr,
        chainId: 1,
        name: 'IcuSelectContract',
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
    display: {
      formats: {
        'setApprovalForAll(address,bool)': {
          intent: '{approved, select, true {Approve all NFT for {operator}} other {Revoke NFT approval for {operator}}}',
          fields: [
            { path: 'operator', label: 'Operator', format: 'address' },
            { path: 'approved', label: 'Approval', format: 'raw' }
          ]
        }
      }
    }
  });

  const decodedApprove = await harness.decoders.decodeCalldata(calldataApprove, icuAddr, 1);
  const intentApprove = decodedApprove?.intent || '';
  record(baseResult(
    'ICU select: approved=true picks "Approve all" branch (no raw {select} leak)',
    intentApprove.startsWith('Approve all NFT for') && !intentApprove.includes('{') && !intentApprove.includes('select'),
    `expected "Approve all NFT for <addr>", got ${JSON.stringify(intentApprove)}`
  ));

  const decodedRevoke = await harness.decoders.decodeCalldata(calldataRevoke, icuAddr, 1);
  const intentRevoke = decodedRevoke?.intent || '';
  record(baseResult(
    'ICU select: approved=false falls through to "other" branch',
    intentRevoke.startsWith('Revoke NFT approval for') && !intentRevoke.includes('{') && !intentRevoke.includes('select'),
    `expected "Revoke NFT approval for <addr>", got ${JSON.stringify(intentRevoke)}`
  ));

  // --- Case 3: bare {param} still works (legacy regression guard) ---
  const bareAddr = '0x2222222222222222222222222222222222222222';
  harness.addMetadata(bareAddr, {
    context: {
      contract: {
        address: bareAddr,
        chainId: 1,
        name: 'BareContract',
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
    display: {
      formats: {
        'setApprovalForAll(address,bool)': {
          intent: 'Set approval for {operator}',
          fields: [
            { path: 'operator', label: 'Operator', format: 'address' },
            { path: 'approved', label: 'Approval', format: 'raw' }
          ]
        }
      }
    }
  });

  const decodedBare = await harness.decoders.decodeCalldata(calldataApprove, bareAddr, 1);
  const intentBare = decodedBare?.intent || '';
  record(baseResult(
    'ICU select: bare {operator} substitution unaffected (legacy path)',
    intentBare.startsWith('Set approval for') && !intentBare.includes('{operator}'),
    `expected "Set approval for <addr>", got ${JSON.stringify(intentBare)}`
  ));

  return results;
}
