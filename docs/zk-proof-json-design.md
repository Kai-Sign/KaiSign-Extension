# ZK-Proof JSON Design (MVP)

This document defines the minimal, deterministic JSON bundle required for server-side
proof generation of KaiSign decoding results. The goal is to make the Railway API output
verifiable and consistent for all clients.

## Canonicalization and hashing

- Canonical JSON: JCS (RFC 8785).
- Hash: sha256(JCS(json)).
- Addresses: lowercase hex ("0x...").
- Bytes/calldata: lowercase hex ("0x...").
- Numbers: decimal strings (no floats).

## Request: DecoderProofRequest

```json
{
  "version": "1",
  "decoderVersion": "2025-01-11",
  "chainId": "1",
  "tx": {
    "to": "0x...",
    "data": "0x...",
    "value": "0"
  },
  "metadata": {
    "contract": {
      "address": "0x...",
      "chainId": "1",
      "erc7730": {
        "formats": [
          "..."
        ]
      }
    },
    "tokens": {
      "0x...": {
        "symbol": "USDC",
        "decimals": "6",
        "name": "USD Coin"
      }
    }
  },
  "options": {
    "formatting": "canonical",
    "language": "en"
  }
}
```

### Notes

- `metadata.contract.erc7730.formats` must be the exact metadata used by the decoder.
- `metadata.tokens` must include every token referenced by formatting.
- `options.formatting` is fixed to avoid client-side presentation variance.

## Response: DecoderProofResponse

```json
{
  "version": "1",
  "decoderVersion": "2025-01-11",
  "publicInputs": {
    "inputHash": "0x...",
    "outputHash": "0x..."
  },
  "result": {
    "intent": "Approve USDC spending",
    "contractName": "USDC",
    "functionName": "approve",
    "args": {
      "spender": "0x...",
      "amount": "1000000"
    },
    "display": {
      "amount": "1.0 USDC"
    }
  },
  "proof": {
    "system": "sp1",
    "proof": "0x..."
  }
}
```

## MVP guarantees

- The server proves `outputHash == sha256(JCS(result))`.
- Clients verify the proof and recompute `outputHash` locally from `result`.
- `inputHash` ties the proof to the exact input bundle.
