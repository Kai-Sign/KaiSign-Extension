# Changelog

All notable changes to the KaiSign Extension are documented here. Format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.3] - 2026-04-29

### Added
- `CHANGELOG.md`, `PRIVACY.md`, `CODE_OF_CONDUCT.md`, `SUPPORT.md`
- `.github/CODEOWNERS`, `.github/dependabot.yml`, issue templates,
  pull-request template
- ERC-7730 metadata coverage: LI.FI bridges (NEAR, Relay), Arbitrum
  protocols, additional Safe multiSend / SafeTx typed-data decoding

### Changed
- `tests/package.json`: bumped `express` to `^4.21.2` to pull a
  patched `path-to-regexp` (resolves
  [GHSA-37ch-88jc-xwx2](https://github.com/advisories/GHSA-37ch-88jc-xwx2))
- `subgraph-metadata.js`: extracted shared `_fetchAndParseApiResponse`
  helper to deduplicate fetch+parse logic
- Logging: gated noisy happy-path `console.log` calls in
  `bridge-script.js`, `background.js`, `options.js`,
  `name-resolution-service.js`, `subgraph-metadata.js`,
  `content-script.js` behind a `KAISIGN_DEBUG` flag (toggle via
  `localStorage['kaisign_dev_mode'] = 'true'` or
  `globalThis.KAISIGN_*_DEBUG = true` for service-worker contexts).
  Real failures surface as `console.warn`/`console.error`.

### Fixed
- Safe `execTransaction` → `multiSend` decoding paths (`recursive-decoder.js`)
- Typed-data popup rendering and transaction dedupe (`content-script.js`)
- Popup text wrapping on long titles
- LiFi metadata caching and intent synthesis
- Delegated-decode and merkle catch-up coverage
- CoW Protocol order metadata

### Removed
- `communication-script.js` (dead — zero references)
- All `../kaisign-backend` cross-repo references from the extension
  source tree. `tests/replay-export.js` now requires `--backend <path>`
  or `KAISIGN_BACKEND_PATH` (no implicit sibling-directory fallback).

### Known limitations
- `advanced-decoder.js` raw-transaction RLP decoding remains TODO.
- `tests/suites/core/advanced.test.js` includes a TODO for matching
  advanced-decoder coverage.

## [1.3.2] - 2026-03-18

### Added
- Verified ABI sweep + recent mainnet metadata flow
- Decode of known selectors on unknown contracts via runtime registry
- Live Sepolia root test
- Audit headers across core decoder files and `AUDIT.md`

### Changed
- On-chain verification: now manual by default
- Verifier: migrated to v1.0.0 4-field leaf + local merkle proofs
- Sepolia registry address updated

### Fixed
- Three intent-quality bugs in popup titles
- Provider `chainId` capture at transaction time
- `remote-metadata-service` reading real backend fields

### Removed
- Dead subgraph + Blobscan fallback path

## [1.3.1] - 2026-02

Initial Chrome Web Store submission baseline. See git history prior to
`da4a579` for the pre-1.3.1 decoder substrate.
