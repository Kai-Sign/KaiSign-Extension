# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in KaiSign, please report it responsibly.

### How to Report

1. **GitHub Security Advisories** (preferred): [Open a private security advisory](https://github.com/Kai-Sign/KaiSign-Extension/security/advisories/new)
2. **Email**: dev@cipherlogic.xyz

**Please do NOT open a public issue for security vulnerabilities.**

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Affected version(s)
- Impact assessment (if known)
- Suggested fix (if any)

### Response Timeline

| Action | Timeframe |
|--------|-----------|
| Acknowledgment | 48 hours |
| Initial assessment | 5 business days |
| Fix development | Depends on severity |
| Public disclosure | After fix is released |

## Scope

The following are in scope for security reports:

- **Content script injection** — XSS or code injection via decoded transaction data
- **Message passing** — Unauthorized access between MAIN world, ISOLATED world, and service worker
- **RPC whitelisting bypass** — Circumventing the allowed-host whitelist in `background.js`
- **Metadata tampering** — Attacks that cause incorrect transaction intent display
- **Privacy leaks** — Transaction data or addresses sent to unauthorized endpoints

### Out of Scope

- Vulnerabilities in third-party dependencies (report upstream)
- Issues requiring physical access to the user's machine
- Social engineering attacks

## Security Design

KaiSign follows these security principles:

- **Local-only decoding** — All transaction decoding runs in the browser; no calldata is sent externally
- **CORS isolation** — Network requests are proxied through the service worker with host whitelisting
- **No remote code execution** — Metadata is data-only JSON (ERC-7730); no executable code is fetched
- **On-chain verification** — Metadata integrity can be verified against the KaiSign Registry (Sepolia)
