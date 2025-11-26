# ERC7730 Metadata Directory

This directory contains ERC7730-compatible metadata files for various smart contracts. These metadata files are used by the snap to decode transaction calldata and provide human-readable information about function calls.

## File Naming Convention

Files are named using the following convention:

- `calldata-{ContractName}.json`: Contains metadata for a specific contract, with focus on calldata decoding
- `common-{ContractName}.json`: Contains metadata for commonly used contracts

## Metadata Format

Each metadata file follows the ERC7730 JSON schema and includes:

1. **Context**: Information about contract deployments, domain, and schemas
   - `eip712`: EIP-712 domain and type information
   - `contract`: Contract ABI information
   
2. **Metadata**: General metadata about the contract
   - `owner`: Contract owner or project name
   
3. **Display**: Display information for UI rendering
   - `formats`: Function-specific display information

## Adding New Metadata

To add metadata for a new contract:

1. Create a new JSON file following the naming convention
2. Include the contract address and chain ID in the `deployments` section
3. Add the contract ABI in the `contract.abi` section
4. Add display information in the `display.formats` section

## Automatic Loading

All metadata files in this directory are automatically loaded when the snap initializes. The `initializeMetadataCache()` function in `utils/metadata.ts` processes all JSON files and caches them for fast access during transaction decoding.

## Example Structure

```json
{
  "$schema": "../../specs/erc7730-v1.schema.json",
  "context": {
    "eip712": {
      "deployments": [
        {
          "chainId": 1,
          "address": "0x1111111254eeb25477b68fb85ed929f73a960582"
        }
      ],
      "domain": {
        "name": "Contract Name",
        "chainId": 1,
        "verifyingContract": "0x1111111254eeb25477b68fb85ed929f73a960582"
      },
      "schemas": []
    },
    "contract": {
      "abi": [
        {
          "inputs": [],
          "name": "functionName",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function",
          "selector": "0x12345678"
        }
      ]
    }
  },
  "metadata": {
    "owner": "Contract Owner"
  },
  "display": {
    "formats": {
      "functionName()": {
        "intent": "Function Purpose",
        "fields": []
      }
    }
  }
}
``` 