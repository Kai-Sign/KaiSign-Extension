# Privacy Policy

KaiSign is designed to surface clear-signing context for on-chain
transactions without compromising user privacy. This document is
intentionally short — there is little to explain because the extension
collects little.

## What KaiSign sends off-device

- **Contract metadata fetches** to the KaiSign API at
  `https://kai-sign-production.up.railway.app/`. Each request is a
  read-only `GET /api/py/contract/{address}?chain_id={N}` lookup. The
  only payload is the contract address, the chain ID, and (for proxies)
  a 4-byte selector. No wallet address, transaction hash, signature, or
  user identifier is ever sent.
- **JSON-RPC reads** to the public providers configured in the
  Options page. These are read-only calls (`eth_call`, `eth_getCode`,
  `eth_chainId`). KaiSign does not relay or sign transactions.
- **ENS / Basenames reverse lookups** (when name resolution is enabled
  in Options). These are read-only RPC calls to the same provider list.

## What KaiSign never sends

- Private keys, mnemonics, or any wallet secret.
- Transaction signatures or pending unsigned payloads.
- Browsing history, cookies, page content, or referrer.
- Telemetry, analytics, crash reports, or usage pings of any kind.

## What KaiSign stores locally

- Decoded transaction history, kept in `chrome.storage.local` on the
  user's device. Capacity is bounded by the `maxTransactions`
  preference (default 100). Cleared via the Options page.
- A small RPC-activity log used by the dashboard view.
- User preferences (theme, RPC endpoints, verification mode).

Local data never leaves the browser unless the user explicitly uses
the **Export** action, which produces a JSON file the user controls.

## Permissions, in plain English

- `storage`, `unlimitedStorage`: required for the local transaction
  history.
- The `host_permissions` list (RPC + KaiSign API hosts): required for
  the read-only fetches described above.
- `content_scripts`: required to surface the popup in the page that
  initiated a wallet request.

## Wallet interaction

KaiSign reads wallet provider events (typed-data sign, contract calls)
to render the popup. It **does not modify, suppress, or relay** any
request to or from the wallet. Approving or rejecting a request is
always done in the wallet, never in KaiSign.

## Contact

Security or privacy concerns: see [SECURITY.md](SECURITY.md). Use the
GitHub Security Advisory flow for sensitive reports rather than public
issues.
