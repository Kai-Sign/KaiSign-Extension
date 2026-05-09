/**
 * Deterministic metadata selector closure gate.
 *
 * This is not an LLM prompt and not a sampled export replay. It runs the
 * backend deterministic selector audit against the local protocol metadata
 * fixtures and fails when a verified protocol write selector is missing from
 * local metadata, or when a local write selector has no display format.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_ROOT = path.resolve(__dirname, '..', '..', '..');
const FIXTURE_METADATA_ROOT = path.resolve(EXTENSION_ROOT, 'tests', 'fixtures', 'metadata');
const DEFAULT_BACKEND_AUDIT = path.resolve(EXTENSION_ROOT, '..', 'kaisign-backend', 'backend', 'tools', 'audit_metadata_selectors.mjs');
const REPORT_JSON = path.resolve(EXTENSION_ROOT, 'tests', '.cache', 'metadata-selector-closure-report.json');

function buildResult(passed, error, output = '') {
  return {
    name: 'coverage/metadata-selector-closure: local protocol metadata contains all verified write selectors',
    passed,
    duration: 0,
    result: { output, reportJson: REPORT_JSON },
    expected: {},
    error,
    skipped: false
  };
}

export async function runTests(harness) {
  const auditScript = process.env.KAISIGN_METADATA_AUDIT_SCRIPT || DEFAULT_BACKEND_AUDIT;
  if (!fs.existsSync(auditScript)) {
    const msg = `Missing deterministic audit script: ${auditScript}`;
    harness.stats.failed++;
    return [buildResult(false, msg)];
  }

  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  const proc = spawnSync(process.execPath, [
    auditScript,
    '--metadata-root', FIXTURE_METADATA_ROOT,
    '--protocols-only',
    '--report-json', REPORT_JSON
  ], {
    cwd: EXTENSION_ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });

  const output = `${proc.stdout || ''}${proc.stderr || ''}`.trim();
  if (proc.error) {
    harness.stats.failed++;
    return [buildResult(false, `audit process failed: ${proc.error.message}`, output)];
  }

  if (proc.status !== 0) {
    harness.stats.failed++;
    return [buildResult(false, `metadata selector closure failed; see ${REPORT_JSON}`, output)];
  }

  harness.stats.passed++;
  return [buildResult(true, null, output)];
}
