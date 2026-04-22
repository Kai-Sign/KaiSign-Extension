# Security Audit Map

Pointers to the security-critical code in this extension. The goal is for an
external reviewer to find each hot spot in under ten seconds via Ctrl-F. For
disclosure policy, see `SECURITY.md`. For per-file rationale, see the
top-of-file headers in `decode.js`, `subgraph-metadata.js`,
`runtime-registry.js`, `recursive-decoder.js`, `advanced-decoder.js`,
`onchain-verifier.js`, and `merkle-tree.js`.

## 1. Trust boundaries

The extension runs in three execution contexts. Every cross-context message
is the boundary you should care about.

| Boundary                                | What crosses                                | Where it's enforced                                  |
| --------------------------------------- | ------------------------------------------- | ---------------------------------------------------- |
| Untrusted page → MAIN world content     | RPC requests intercepted via window.ethereum | `inject-script.js`, `advanced-decoder.js`            |
| MAIN world → ISOLATED world bridge      | `KAISIGN_RPC_CALL`, `KAISIGN_FETCH_BLOB`    | `bridge-script.js:122,142` (message-type allow-list) |
| ISOLATED world → service worker         | `chrome.runtime.sendMessage` calls          | `bridge-script.js:172` (listener)                    |
| Service worker → external RPC/subgraph  | All outbound `fetch(...)`                   | `background.js:283-309` (RPC_CALL host whitelist)    |

The MAIN world is contaminated by definition (it shares globals with the page).
Treat anything coming out of MAIN as untrusted. The bridge and the service
worker are the trust gates.

`merkle-tree.js` makes RPC calls (`eth_getLogs`, `eth_blockNumber`, `eth_call`)
through the same bridge → service-worker pipeline as `onchain-verifier.js`,
so the same host whitelist gates its traffic. The RPC method itself is not
allow-listed (any JSON-RPC method goes through), but every call still has to
land at a whitelisted host.

## 2. RPC host whitelist

All outbound RPC traffic is gated by an allow-list in `background.js`.

| Item                       | Location                                   |
| -------------------------- | ------------------------------------------ |
| Allow-list constant        | `background.js:286-296` (`ALLOWED_RPC_HOSTS`) |
| Local dev port allow-list  | `background.js:297` (`ALLOWED_LOCAL_PORTS`) |
| Enforcement (rejects on miss) | `background.js:298-309`                  |
| HTTPS-only check (except localhost) | `background.js:301-303`             |

**Adding a new endpoint requires updating `ALLOWED_RPC_HOSTS`.** A bypass
here means the extension would happily exfiltrate transaction-context data
to any URL the page chose. Reviewers: confirm no other code path performs
`fetch()` to user-influenced URLs.

## 3. On-chain verification (two-leaf merkle proof, v1.0.0)

`onchain-verifier.js` computes two leaf hashes locally (availability +
revocation) and proves each one's membership in the registry's `merkleRoot()`
using a locally-replayed merkle tree (`merkle-tree.js`). If availability is
in the tree and revocation is not, the metadata is verified.

| Item                                                     | Location                          |
| -------------------------------------------------------- | --------------------------------- |
| Registry contract address (Sepolia)                      | `onchain-verifier.js:39`          |
| New 4-field `LEAF_TYPEHASH` derivation                   | `onchain-verifier.js:72-74`       |
| Local leaf computation (encode + hash)                   | `onchain-verifier.js:376-390`     |
| `merkleRoot()` view-call fetch                           | `onchain-verifier.js:425-436`     |
| Two-leaf verification flow (`verifyMetadataAgainstRoot`) | `onchain-verifier.js:501-613`     |
| Off-chain `verifyMerkleProof` port                       | `onchain-verifier.js:630-642`     |
| Registry-scoped merkle root cache                        | `onchain-verifier.js:669-725`     |

**Critical invariants:**
- **4-field leaf** (no `idx`): `keccak256(abi.encode(LEAF_TYPEHASH, chainId,
  extcodehash, metadataHash, revoked))`. Mismatching field order or count
  produces a leaf that will never appear in the tree → silent "unattested"
  even when the metadata is, in fact, attested.
- **Two leaves per metadata**: one with `revoked=false` (availability), one
  with `revoked=true` (revocation). Both contracts and verifier must agree
  on this — see `KaiSignRegistry.sol:383-389` and `:505-511`.
- **`metadataHash = keccak256(canonical(metadata))`** with sorted-key JSON.
  Backend MUST use the same canonicalization or every verification fails.

The pre-v1.0.0 model (single per-uid leaf fetched via `getAttestation` +
`computeAttestationLeaf`) is gone. There is no struct-parsing path anymore;
nothing in the verifier slices the `getAttestation` return for leaf
construction. The `word[3]/word[4]` warning from earlier audits no longer
applies to the verification path. (`merkle-tree.js` does parse the struct
when reading `metadataHash` for leaf reconstruction during indexing — see §3a
for the trust analysis.)

## 3a. Local merkle tree (proof generation)

`merkle-tree.js` indexes registry events and replays the on-chain incremental
merkle tree client-side so it can generate proofs without a backend
dependency. The contract's `filledSubtrees` cache is sufficient for the
contract to compute the next root, but NOT for arbitrary historical proofs —
hence the local replay.

| Item                                                  | Location                         |
| ----------------------------------------------------- | -------------------------------- |
| Storage shape (per-registry leaf log)                 | `merkle-tree.js` (`_storageKey`, `state`) |
| `treeDepth()` fetched once per load                   | `merkle-tree.js` (`_ensureTreeDepth`) |
| `zeroHashes` precompute (matches contract :144-148)   | `merkle-tree.js` (`_buildZeroHashes`) |
| Tree replay (`_buildTree`)                            | `merkle-tree.js` (`_buildTree`)  |
| Proof generation                                      | `merkle-tree.js` (`proveLeaf`)   |
| Root-mismatch self-heal (wipe + re-index)             | `merkle-tree.js` (`ensureRootMatches`) |
| Event indexing (`SpecIndexed`, `RevokeFinalized`)     | `merkle-tree.js` (`_fetchInsertionEvents`) |

**Critical invariants:**
- **Insertion order = `(blockNumber, logIndex)`** lexicographically across
  BOTH event types. Reordering equals tree corruption (different positions →
  different proofs → root mismatch).
- **`RevokeFinalized` filtering**: only `revoked=true` events insert leaves
  (`KaiSignRegistry.sol:500-520`). Including `revoked=false` events would
  insert leaves that don't exist on-chain → root mismatch.
- **Self-healing on mismatch**: if the locally-computed root doesn't equal
  `merkleRoot()` after a catch-up, state is dropped and re-indexed from the
  deploy block. `proveLeaf` is never called against an unverified tree;
  `verifyMetadataAgainstRoot` requires `ensureRootMatches(root) === true`
  before consulting `proveLeaf`.

A reviewer can verify the tree implementation against the contract by
comparing `_buildTree` to `KaiSignRegistry._insertLeaf` (:576-590) — same
swap-on-odd-position logic, same `zeroHashes` padding for missing siblings.

## 4. Calldata bounds checking

`decode.js` is the ABI decoder. Inputs are untrusted bytes; bounds matter.

| Item                              | Location                |
| --------------------------------- | ----------------------- |
| `safeSlice` (zero-pads on truncation) | `decode.js:255`     |
| `parseArrayType` (rejects malformed types) | `decode.js:277` |
| Two's-complement signed ints      | `decode.js:392-400`     |
| `formatTokenAmount` MAX_UINT256 sentinel | `decode.js:1198-1199` |
| Token-amount packed-bitfield guard | `decode.js:1177` (formatter)  |

**Critical invariant — `safeSlice` does not throw.** It zero-pads when the
calldata is shorter than the requested slice. The LiFi minimal fixtures and
many real-world short calls depend on this. A throw here propagates and
breaks the popup; an unguarded out-of-bounds read would propagate undefined
into the formatter and could mislead the title.

## 5. Metadata integrity (verification gate)

`subgraph-metadata.js` is the only place that fetches metadata. Every blob
is verified against the registry before it lands in the cache.

| Item                                   | Location                          |
| -------------------------------------- | --------------------------------- |
| `verifyMetadataAgainstRoot` call site  | `subgraph-metadata.js:376-381`    |
| `_verification` set on success/error   | `subgraph-metadata.js:381,384`    |
| Cache write (after `await`)            | `subgraph-metadata.js:390`        |
| Popup badge (verified / unverified)    | `content-script.js:3078-3122`     |

**Critical invariant — verification is awaited before cache write.** A
fire-and-forget `.then()` here freezes `_verification` as `undefined` in the
cached entry; subsequent lookups will display unverified metadata as if it
had been verified. The `await` at `subgraph-metadata.js:376` is load-bearing.

The popup surfaces the result via `updateVerificationBadge` at
`content-script.js:3112`. Unverified metadata must show the unverified
state — never silently render as verified. The verifier returns one of four
`source` values (`merkle-verified`, `revoked`, `unattested`, `root-unavailable`);
the badge code must distinguish `verified=true` from any other case.

## 6. Last-resort selector fallback

`runtime-registry.js` ships a small embedded table mapping ERC-standard
selectors to their canonical signatures. It is consulted by `decode.js`
when subgraph metadata + ABI lookup both fail, so the popup degrades to
"Unknown call (transferFrom)" instead of "Unknown call 0xa9059cbb".

| Item                              | Location                  |
| --------------------------------- | ------------------------- |
| Registry construction (load-once) | `runtime-registry.js`     |
| Decoder consultation              | `decode.js` (unknown-function fallback path) |

This file is data-only by design. Reviewers: confirm every entry's
`keccak256(signature).slice(0,10) === selector`. Adding a non-ERC-standard
selector here defeats the purpose of the on-chain verification gate.

## 7. Recursive decoding bounds

`recursive-decoder.js` is the only place that recurses into nested calldata.

| Item                              | Location                    |
| --------------------------------- | --------------------------- |
| `maxDepth` default (5)            | `recursive-decoder.js:32`   |
| Cycle detection stack             | `recursive-decoder.js:33`   |
| Depth check before recursion      | `recursive-decoder.js:61`   |

The decoder is metadata-driven; a malicious metadata blob could in principle
request unbounded recursion. The depth limit is the load-bearing guard.

## 8. Known-good test corpus

| Item                              | Location                                |
| --------------------------------- | --------------------------------------- |
| Full test runner                  | `tests/run-all-tests.js`                |
| Decoder unit / integration suites | `tests/suites/`                         |
| EIP-712 fixture suite             | `tests/suites/eip712/`                  |
| LiFi Diamond fixture suite        | `tests/fixtures/metadata/protocols/lifi-diamond/` |
| Real-export replay tool           | `tests/replay-export.js`                |

Coverage strategy is real-world-capture replay, not fuzzing. The replay
tool ingests a popup export and re-decodes every transaction in-process,
catching title-rendering regressions against a pinned baseline.

## 9. Out-of-scope by design

| Threat                              | Mitigation / why excluded                                  |
| ----------------------------------- | ---------------------------------------------------------- |
| RPC endpoint compromise             | On-chain verification gate (§5); a lying RPC cannot forge a leaf hash that matches the registry. |
| Browser / wallet vulnerabilities    | The extension never signs for the user; it only renders intent. A compromised wallet is out of scope. |
| Social engineering                  | The extension renders what it can verify; it cannot prevent a user from approving a verified-but-undesirable action. |
| Third-party dependency vulns        | Reported upstream per `SECURITY.md`. No transitive auditing in this repo. |
| Side-channel observation by the page | The MAIN world shares globals with the page by design; treat MAIN-world state as observable. |
