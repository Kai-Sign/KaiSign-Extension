/**
 * Title-address-overflow test.
 *
 * Intent titles that include a full 42-char address (e.g. ICU select
 * resolutions like "Approve all BAYC for 0x1e0049783f008a0085193e00003d00cd54003c71")
 * blow out the popup width. The renderer should truncate any 0x-address in
 * the title to a short form (`0x1234…5678`) while preserving the full
 * value for hover via the title="" HTML attribute.
 *
 * This suite tests the pure formatter `formatTitleAddresses` only; the
 * popup wiring is covered by manual smoke. The wiring just needs to:
 *   1. show `formatTitleAddresses(intent)` in the title element
 *   2. set `title="${intent}"` so hover reveals the full string
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

  const fn = harness.decoders?.formatTitleAddresses
    || (typeof window !== 'undefined' && window.formatTitleAddresses);

  if (typeof fn !== 'function') {
    record(baseResult(
      'title overflow: formatTitleAddresses helper exists',
      false,
      'window.formatTitleAddresses is not a function — helper not implemented yet'
    ));
    return results;
  }

  // Case 1: single full address gets truncated to short form
  const t1 = 'Approve all BAYC for 0x1e0049783f008a0085193e00003d00cd54003c71';
  const r1 = fn(t1);
  record(baseResult(
    'title overflow: 42-char address truncated to 0x1e00…3c71',
    r1 === 'Approve all BAYC for 0x1e00…3c71',
    `expected "Approve all BAYC for 0x1e00…3c71", got ${JSON.stringify(r1)}`
  ));

  // Case 2: already-short address (e.g. 0x0000…dead) is left alone
  const t2 = 'Send to 0x1234…5678';
  const r2 = fn(t2);
  record(baseResult(
    'title overflow: already-truncated address is not double-truncated',
    r2 === t2,
    `expected unchanged, got ${JSON.stringify(r2)}`
  ));

  // Case 3: title with no address is unchanged
  const t3 = 'Swap exact in ×3';
  const r3 = fn(t3);
  record(baseResult(
    'title overflow: title with no address is returned unchanged',
    r3 === t3,
    `expected unchanged, got ${JSON.stringify(r3)}`
  ));

  // Case 4: multiple addresses in same title — both get truncated
  const t4 = 'Transfer from 0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48 to 0x9bf81cc31d0f1fa7ade83058509a4db154a182a2';
  const r4 = fn(t4);
  record(baseResult(
    'title overflow: multiple addresses each get truncated',
    r4 === 'Transfer from 0xa0b8…eb48 to 0x9bf8…82a2',
    `expected both truncated, got ${JSON.stringify(r4)}`
  ));

  // Case 5: empty/null input is safe
  record(baseResult(
    'title overflow: empty string returns empty string',
    fn('') === '',
    `expected "", got ${JSON.stringify(fn(''))}`
  ));

  return results;
}
