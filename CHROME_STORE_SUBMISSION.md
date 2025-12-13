# KaiSign - Chrome Web Store Submission Guide

## Basic Information

### Extension Name
```
KaiSign
```

### Short Description (132 characters max)
```
Transaction analysis and clear signing for Ethereum wallets. Decode smart contract interactions before you sign.
```

### Detailed Description
```
KaiSign is a powerful browser extension that provides clear, human-readable explanations of Ethereum transactions before you sign them.

KEY FEATURES:

Transaction Decoding
- Automatically decodes smart contract function calls
- Shows function names, parameters, and intended actions
- Supports ERC-20, ERC-721, ERC-1155 token standards
- Handles complex multicall and batch transactions

Clear Signing Support
- ERC-7730 compliant metadata integration
- Human-readable intent descriptions
- Recursive calldata decoding for nested transactions
- EIP-712 typed data signature parsing

Protocol Support
- Uniswap Universal Router
- Safe Wallet (Gnosis Safe)
- Aave, Compound, and other DeFi protocols
- Custom protocol metadata via subgraph

Security Features
- Pre-sign transaction analysis
- Token approval warnings
- Contract interaction details
- Transaction history tracking

Privacy First
- All decoding happens locally in your browser
- No private keys or transaction data sent to external servers
- Metadata fetched from decentralized subgraph

HOW IT WORKS:
1. Install the extension
2. Visit any dApp (Uniswap, OpenSea, Aave, etc.)
3. When a transaction is triggered, KaiSign shows a clear explanation
4. Review the transaction details before confirming in your wallet

Perfect for DeFi users, NFT traders, and anyone who wants to understand exactly what they're signing.
```

---

## Required Assets

### Extension Icons (PNG format required)

| Size | File | Description |
|------|------|-------------|
| 16x16 | `icons/icon-16.png` | Browser toolbar |
| 32x32 | `icons/icon-32.png` | Windows taskbar |
| 48x48 | `icons/icon-48.png` | Extension management page |
| 128x128 | `icons/icon-128.png` | Chrome Web Store display |

**Icon Design Specifications:**
- Background: Linear gradient 135deg from #58a6ff to #a371f7
- Text: "KS" in white, bold, centered
- Border radius: ~15% of size
- Template SVG provided at `icons/icon-template.svg`

**To generate PNG icons from SVG:**
```bash
# Using ImageMagick
convert -background none -resize 16x16 icons/icon-template.svg icons/icon-16.png
convert -background none -resize 32x32 icons/icon-template.svg icons/icon-32.png
convert -background none -resize 48x48 icons/icon-template.svg icons/icon-48.png
convert -background none -resize 128x128 icons/icon-template.svg icons/icon-128.png

# Or use online tools like:
# - https://cloudconvert.com/svg-to-png
# - https://www.svgviewer.dev/
```

### Screenshots (1280x800 or 640x400)

**Screenshot 1: Transaction Popup**
```
[PLACEHOLDER: Screenshot showing KaiSign popup with decoded transaction]
- Show the popup appearing over a dApp
- Display function name, parameters, intent
- Highlight the "KS" logo in corner
```

**Screenshot 2: Multicall Decoding**
```
[PLACEHOLDER: Screenshot showing batch transaction breakdown]
- Show a multicall transaction with multiple operations
- Display nested transaction tree
- Show aggregated intents
```

**Screenshot 3: EIP-712 Signature**
```
[PLACEHOLDER: Screenshot showing typed data signature]
- Show EIP-712 message breakdown
- Display domain info and message fields
- Highlight permit/approval details
```

**Screenshot 4: Transaction History**
```
[PLACEHOLDER: Screenshot of popup with transaction list]
- Show list of recent transactions
- Display search and filter options
- Show export functionality
```

**Screenshot 5: Settings Page**
```
[PLACEHOLDER: Screenshot of options/settings page]
- Show configuration options
- Display theme selection
- Show data management tools
```

### Promotional Images

**Small Promo Tile (440x280)**
```
[PLACEHOLDER: Promotional graphic]
Design elements:
- KaiSign logo prominent
- Tagline: "Know what you sign"
- Gradient background matching brand colors
- Optional: Transaction preview mockup
```

**Large Marquee (920x680) - Optional**
```
[PLACEHOLDER: Large promotional banner]
Design elements:
- Full product showcase
- Multiple feature highlights
- Clear value proposition
```

---

## Store Listing Details

### Category
```
Developer Tools
```
Alternative: `Productivity`

### Language
```
English (United States)
```

### Tags (up to 5)
```
ethereum, web3, crypto, blockchain, security
```

---

## Privacy & Permissions

### Single Purpose Description
```
KaiSign decodes and displays human-readable descriptions of Ethereum transactions before the user signs them, helping users understand exactly what they are authorizing.
```

### Permission Justifications

| Permission | Justification |
|------------|---------------|
| `activeTab` | Required to inject content scripts that intercept transaction requests on dApp websites |
| `storage` | Used to save transaction history and user preferences locally |
| `unlimitedStorage` | Allows storing extended transaction history and cached metadata |

### Host Permissions Justification

| Host | Purpose |
|------|---------|
| `api.studio.thegraph.com` | Fetch ERC-7730 metadata from KaiSign subgraph |
| `api.sepolia.blobscan.com` | Access blob data for EIP-4844 transactions |
| `api.gateway.ethswarm.org` | Retrieve metadata from Swarm decentralized storage |
| `storage.googleapis.com` | Access cached metadata files |
| `kai-sign-production.up.railway.app` | KaiSign API for contract metadata lookup |

### Remote Code
```
This extension does not execute remote code. All JavaScript is bundled with the extension.
```

### Data Usage Disclosure
```
This extension:
- Does NOT collect personal data
- Does NOT transmit private keys or wallet data
- Does NOT track user behavior
- DOES fetch contract metadata from public APIs (no user data sent)
- DOES store transaction history locally (never uploaded)
```

---

## Privacy Policy

**Required URL**: You must host a privacy policy. Sample text:

```markdown
# KaiSign Privacy Policy

Last updated: [DATE]

## Data Collection
KaiSign does not collect, store, or transmit any personal data to external servers.

## Local Storage
Transaction history and preferences are stored locally in your browser using Chrome's storage API. This data never leaves your device.

## External Requests
KaiSign makes requests to the following services to fetch contract metadata:
- The Graph (api.studio.thegraph.com) - for ERC-7730 metadata
- Blobscan (api.blobscan.com) - for blob transaction data
- Ethswarm (api.gateway.ethswarm.org) - for decentralized metadata

These requests contain only contract addresses and chain IDs, never personal data or wallet information.

## Security
All transaction analysis happens locally in your browser. No private keys, signatures, or sensitive wallet data is ever transmitted.

## Contact
[Your contact information]
```

**Recommended hosting options:**
- GitHub Pages (free)
- Your project website
- Notion public page

---

## Checklist Before Submission

- [ ] All 4 icon sizes created (16, 32, 48, 128 PNG)
- [ ] At least 1 screenshot (1280x800 or 640x400)
- [ ] Small promo tile (440x280)
- [ ] Privacy policy URL ready
- [ ] Extension tested and working
- [ ] manifest.json version updated
- [ ] No console.log statements in production code
- [ ] All files referenced in manifest exist

---

## Submission Steps

1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Pay one-time $5 developer fee (if first time)
3. Click "New Item"
4. Upload ZIP file of extension folder
5. Fill in store listing details from this document
6. Upload screenshots and promotional images
7. Submit for review

**ZIP Creation:**
```bash
cd /path/to/KaiSign-Extension
zip -r kaisign-extension.zip . -x "*.git*" -x "node_modules/*" -x "*.backup" -x "*.md" -x "test*"
```

---

## File Structure for Submission

```
kaisign-extension/
  icons/
    icon-16.png
    icon-32.png
    icon-48.png
    icon-128.png
  manifest.json
  background.js
  popup.html
  popup.css
  popup.js
  options.html
  options.css
  options.js
  content-script.js
  bridge-script.js
  decode.js
  metadata.js
  subgraph-metadata.js
  runtime-registry.js
  recursive-decoder.js
  advanced-decoder.js
  eip712-decoder.js
```
