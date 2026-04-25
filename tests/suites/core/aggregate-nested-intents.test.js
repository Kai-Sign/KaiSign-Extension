/**
 * Unit tests for aggregateNestedIntents (decode.js).
 *
 * Covers the dedup branch: identical inner intents collapse with ×N counts
 * while preserving first-occurrence order. Distinct intents are joined with
 * ' + ' as before.
 */

function buildResult(name, passed, error = null) {
  return {
    name,
    passed,
    duration: 0,
    result: null,
    expected: {},
    error,
    skipped: false
  };
}

function assertEq(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export async function runTests(harness) {
  const results = [];
  const aggregate = globalThis.window?.aggregateNestedIntents;

  const record = (result) => {
    results.push(result);
    if (harness?.stats) {
      if (result.passed) harness.stats.passed++;
      else harness.stats.failed++;
    }
  };

  if (typeof aggregate !== 'function') {
    record(buildResult(
      'aggregateNestedIntents export available',
      false,
      'window.aggregateNestedIntents is not a function — decode.js export missing'
    ));
    return results;
  }

  // Empty / nullish input → undefined
  {
    let passed = true; let err = null;
    try {
      assertEq(aggregate(undefined), undefined, 'undefined input');
      assertEq(aggregate(null), undefined, 'null input');
      assertEq(aggregate([]), undefined, 'empty array');
    } catch (e) { passed = false; err = e.message; }
    record(buildResult('Empty input returns undefined', passed, err));
  }

  // Distinct intents joined with ' + '
  {
    let passed = true; let err = null;
    try {
      assertEq(
        aggregate(['Approve 100 USDC', 'Swap exact in']),
        'Approve 100 USDC + Swap exact in',
        'distinct intents'
      );
    } catch (e) { passed = false; err = e.message; }
    record(buildResult('Distinct intents joined with " + "', passed, err));
  }

  // Three identical intents collapse to ×3
  {
    let passed = true; let err = null;
    try {
      assertEq(
        aggregate(['Swap exact in', 'Swap exact in', 'Swap exact in']),
        'Swap exact in ×3',
        'three identical'
      );
    } catch (e) { passed = false; err = e.message; }
    record(buildResult('Three identical intents collapse to ×3', passed, err));
  }

  // Mixed: per-distinct counts, first-occurrence order preserved
  {
    let passed = true; let err = null;
    try {
      assertEq(
        aggregate(['Swap A', 'Swap A', 'Swap B']),
        'Swap A ×2 + Swap B',
        'two A + one B'
      );
      assertEq(
        aggregate(['Swap B', 'Swap A', 'Swap A']),
        'Swap B + Swap A ×2',
        'order preserved by first occurrence'
      );
    } catch (e) { passed = false; err = e.message; }
    record(buildResult('Per-distinct counts with first-occurrence order', passed, err));
  }

  // Single intent stays unannotated
  {
    let passed = true; let err = null;
    try {
      assertEq(aggregate(['Lonely intent']), 'Lonely intent', 'singleton');
    } catch (e) { passed = false; err = e.message; }
    record(buildResult('Singleton intent stays unannotated', passed, err));
  }

  return results;
}
