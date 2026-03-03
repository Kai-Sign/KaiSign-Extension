# Contributing to KaiSign Extension

Thanks for your interest in contributing! **KaiSign Extension** is a Chrome extension that uses the [KaiSign](https://github.com/Kai-Sign) on-chain metadata registry for transaction decoding and verification. It's under active development and PRs are welcome — whether you're fixing a decoding bug, adding a new protocol, or improving the UI.

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork:
   ```bash
   git clone https://github.com/<your-username>/KaiSign-Extension.git
   cd KaiSign-Extension
   ```
3. **Load the extension** in Chrome:
   - Go to `chrome://extensions/`
   - Enable **Developer mode**
   - Click **Load unpacked** and select the repo root
4. Make your changes and test them

No build step — the extension runs directly from source.

## Development Guidelines

- **No build tools or bundlers** — all code runs as-is in the browser
- **No external runtime dependencies** — the extension is self-contained (Node.js is only used for tests)
- **Match existing code style** — vanilla JS, no frameworks, consistent naming
- **MAIN vs. ISOLATED world** — understand which world your code runs in:
  - MAIN world scripts (`content-script.js`, `decode.js`, etc.) share the page's JS context
  - ISOLATED world (`bridge-script.js`) bridges messages to the background service worker
  - Use `fetchViaBackground()` / `rpcCallViaBackground()` for network requests from MAIN world

## Adding Protocol Support

This is the most impactful way to contribute. Many contracts and protocols don't decode correctly yet — **PRs that improve decoding coverage are especially welcome**.

### Steps

1. **Create metadata** — Add an ERC-7730 JSON file in `tests/fixtures/metadata/protocols/`:

   ```json
   {
     "$schema": "https://eips.ethereum.org/assets/eip-7730/erc7730-v1.schema.json",
     "context": {
       "contract": {
         "deployments": [
           { "chainId": 1, "address": "0x..." }
         ],
         "abi": [ ... ]
       }
     },
     "display": {
       "formats": {
         "0xSELECTOR": {
           "intent": "Description of what this function does",
           "fields": [ ... ]
         }
       }
     }
   }
   ```

2. **Add test cases** — Create a test file with real transaction calldata. See existing tests in `tests/` for the pattern.

3. **Test locally**:
   ```bash
   cd tests
   npm install
   npm test
   ```

4. **Submit a PR** — include the protocol name, contract address, and which functions you added.

### Local Development Server

You can test metadata changes live in the browser before submitting a PR:

1. **Start the local server:**
   ```bash
   cd tests
   npm install
   npm run local-server
   ```

2. **Point the extension at it:**
   - Open extension options (right-click extension icon → Options)
   - Set **Backend API URL** to `http://localhost:3000`
   - Save settings

3. **Iterate:** Edit your metadata JSON in `tests/fixtures/metadata/protocols/`, restart the server, and trigger the transaction on a dapp to see your changes decoded in real time.

The local server falls back to the production API for any contract not found in your local fixtures, so the extension continues to work normally for all other transactions.

### Finding Missing Protocols

If you encounter a transaction that KaiSign doesn't decode:

1. Note the contract address and function selector
2. Look up the ABI on Etherscan or the protocol's docs
3. Create the metadata JSON following the ERC-7730 format
4. Test with real calldata from the transaction

## Commit Messages

Use clear, descriptive commit messages:

```
Add Aave V3 Pool metadata for supply and withdraw functions
Fix tuple[] decoding for nested ParaSwap calldata
Update popup styling for EIP-712 display
```

Prefix with the action: `Add`, `Fix`, `Update`, `Remove`, `Refactor`.

## Pull Request Guidelines

- **One PR per feature or fix** — keep changes focused
- **Include test cases** when adding protocol support or fixing decoders
- **Describe what and why** in the PR description
- **No hardcoded values** — use parameters, metadata, or config
- **No secrets** — never commit API keys or credentials

### PR Checklist

- [ ] Changes work when loaded as an unpacked extension
- [ ] Tests pass (`cd tests && npm test`)
- [ ] New protocol metadata follows ERC-7730 format
- [ ] No hardcoded addresses, keys, or secrets
- [ ] Commit message is descriptive

## Testing

### Environment Variables

Some tests require API keys for on-chain verification. Copy the template:

```bash
cp tests/.env.example tests/.env
```

See `tests/.env.example` for details. Tests that require missing keys will be skipped.

### Running Tests

```bash
cd tests
npm install
npm test
```

## Architecture Overview

```
Dapp → MAIN world scripts → bridge-script.js (ISOLATED) → background.js
                                                              ↓
                                                         External APIs
```

- **decode.js** — Pure ABI decoder using keccak256 + SimpleInterface
- **metadata.js** — Loads ERC-7730 metadata for known contracts
- **recursive-decoder.js** — Unwraps nested calls (multicall, Diamond facets)
- **content-script.js** — Intercepts wallet RPCs, renders the popup UI
- **background.js** — Service worker handling CORS-bypassed fetches and RPC calls

## Questions?

Open an issue on GitHub or reach out at dev@cipherlogic.xyz.
