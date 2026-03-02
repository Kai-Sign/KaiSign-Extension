# KaiSign

[![CI](https://github.com/Kai-Sign/KaiSign-Extension/actions/workflows/test.yml/badge.svg)](https://github.com/Kai-Sign/KaiSign-Extension/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-KaiSign-4285F4?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/kaisign/YOUR_EXTENSION_ID)

**Transaction analysis and clear signing for Ethereum wallets.**

> KaiSign intercepts `eth_sendTransaction` and `eth_signTypedData` calls in your browser, decodes the calldata using [ERC-7730](https://eips.ethereum.org/EIPS/eip-7730) metadata, and presents a human-readable summary before you sign.

---

## Status & Contributions

KaiSign is under **active development**. Some transaction decoding may not work for all contracts or protocols yet — coverage is expanding with every release.

**PRs are welcome and encouraged.** Whether it's adding metadata for a new protocol, fixing a decoding edge case, or improving the UI, we'd love your help. The team will improve functionality where needed based on community feedback.

See [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

---

## Features

- **Transaction Decoding** — Decodes `eth_sendTransaction` calldata into human-readable intents (e.g., "Swap 1.5 ETH for USDC on Uniswap")
- **ERC-7730 Metadata** — Structured, standardized metadata format for contract function descriptions
- **EIP-712 Typed Data** — Decodes `eth_signTypedData` messages (permits, orders, Safe transactions)
- **20+ Protocol Support** — Uniswap, Aave, Lido, 1inch, CoW Protocol, LiFi, Safe, Seaport, and more
- **Recursive Decoding** — Unwraps nested calls (multicall, batch, Diamond proxy facets)
- **On-Chain Verification** — Verifies metadata against the KaiSign Registry on Sepolia
- **Account Abstraction** — Supports ERC-4337 UserOperations, Safe multisig, and EIP-7702 delegations
- **Privacy-First** — All decoding runs locally in the browser; no transaction data leaves your machine

## Installation

### Chrome Web Store

Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/kaisign/YOUR_EXTENSION_ID).

### From Source

```bash
git clone https://github.com/Kai-Sign/KaiSign-Extension.git
cd KaiSign-Extension
```

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the repo root

No build step required — the extension runs directly from source.

## How It Works

```
┌─────────────────────────────────────────────────────────┐
│  Dapp (any website)                                     │
│                                                         │
│  eth_sendTransaction / eth_signTypedData                │
│         │                                               │
│         ▼                                               │
│  ┌─────────────────────────┐    MAIN world              │
│  │  content-script.js      │    Intercepts wallet RPCs, │
│  │  decode.js              │    decodes calldata,       │
│  │  recursive-decoder.js   │    renders popup           │
│  │  metadata.js            │                            │
│  └──────────┬──────────────┘                            │
│             │ window.postMessage                        │
│             ▼                                           │
│  ┌─────────────────────────┐    ISOLATED world          │
│  │  bridge-script.js       │    Forwards messages to    │
│  │                         │    the service worker      │
│  └──────────┬──────────────┘                            │
│             │ chrome.runtime.sendMessage                 │
│             ▼                                           │
│  ┌─────────────────────────┐    Service Worker          │
│  │  background.js          │    Handles CORS-bypassed   │
│  │                         │    fetches and RPC calls   │
│  └─────────────────────────┘                            │
└─────────────────────────────────────────────────────────┘
```

The extension uses Chrome's Manifest V3 with two content script worlds:

- **MAIN world** scripts share the page's JS context and can intercept wallet provider calls
- **ISOLATED world** bridge forwards messages to the background service worker for network requests (CORS bypass)

## Supported Protocols

| Category | Protocols |
|----------|-----------|
| **DEX** | Uniswap (Universal Router, V3 Factory, Quoter), 1inch Router V6, ParaSwap Augustus V6, CoW Protocol (Settlement, Composable, ETH Flow, Hooks Trampoline), 0x Exchange Proxy, Aerodrome (Base), Curve Router NG |
| **Lending** | Aave V3 Pool, Compound V3 (cUSDC), Fluid USDC Vault |
| **Staking** | Lido stETH, Lido wstETH |
| **NFT / Marketplace** | Seaport V1.6 |
| **Account Abstraction** | Safe (Singleton, Proxy Factory, MultiSend), ERC-4337 EntryPoint V0.6, Ambire EIP-7702, Smart Account |
| **Cross-Chain** | LiFi Diamond (12 facet groups) |
| **Tokens** | ERC-20 (USDC, WETH), Permit2 |
| **EIP-712 Signing** | ERC-20 Permit, 1inch Limit Order, CoW GPv2 Order, Safe SafeTx, Seaport Order |

## Development

### Prerequisites

- Chrome or Chromium-based browser
- Node.js 18+ (for tests only)

### Running Tests

```bash
cd tests
npm install
npm test
```

Some tests require API keys — see [`tests/.env.example`](tests/.env.example) for the template.

### Project Structure

```
├── manifest.json              # Extension manifest (V3)
├── background.js              # Service worker (CORS proxy, RPC)
├── bridge-script.js           # ISOLATED world message bridge
├── content-script.js          # MAIN world — UI, interception, popup
├── decode.js                  # Pure ABI decoder (keccak256 + SimpleInterface)
├── recursive-decoder.js       # Recursive call unwrapping
├── advanced-decoder.js        # Extended decoding strategies
├── eip712-decoder.js          # EIP-712 typed data decoder
├── metadata.js                # ERC-7730 metadata loader
├── subgraph-metadata.js       # API metadata fetching, proxy/Diamond support
├── onchain-verifier.js        # KaiSign Registry verification (Sepolia)
├── runtime-registry.js        # Runtime metadata registry
├── name-resolution-service.js # ENS / Basename resolution
├── tests/
│   ├── fixtures/metadata/     # ERC-7730 metadata fixtures
│   ├── scripts/               # Test utilities
│   └── run-all-tests.js       # Test runner
└── .github/workflows/         # CI/CD
```

## Adding Protocol Support

Want to add support for a new protocol? See the [Contributing Guide](CONTRIBUTING.md#adding-protocol-support) for details. In short:

1. Create an ERC-7730 metadata JSON file in `tests/fixtures/metadata/protocols/`
2. Add test cases with real calldata
3. Submit a PR

## Funding

KaiSign is supported by an [ENS Public Goods](https://builder.ensgrants.xyz/) grant. We're grateful to the ENS ecosystem for supporting open source Ethereum tooling.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines and how to submit changes.

## Security

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

## License

[MIT](LICENSE)
