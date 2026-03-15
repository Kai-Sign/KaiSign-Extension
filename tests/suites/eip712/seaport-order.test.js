/**
 * Seaport Order EIP-712 Tests
 *
 * Tests complex nested typed arrays: OrderComponents contains OfferItem[]
 * and ConsiderationItem[] — these are EIP-712 nested struct arrays that
 * require recursive type resolution.
 */

import { loadMetadata } from '../../lib/metadata-loader.js';

export async function runTests(harness) {
  const results = [];

  const seaportAddress = '0x0000000000000068F116a894984e2DB1123eB395'.toLowerCase();
  harness.addMetadata(seaportAddress, loadMetadata('eip712/seaport-order.json'));

  // Test 1: Seaport OrderComponents with OfferItem[] and ConsiderationItem[]
  results.push(await harness.runEIP712Test({
    name: 'Seaport Order with nested typed arrays (OfferItem[], ConsiderationItem[])',
    typedData: {
      domain: {
        name: 'Seaport',
        version: '1.6',
        chainId: 1,
        verifyingContract: '0x0000000000000068F116a894984e2DB1123eB395'
      },
      primaryType: 'OrderComponents',
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' }
        ],
        OrderComponents: [
          { name: 'offerer', type: 'address' },
          { name: 'zone', type: 'address' },
          { name: 'offer', type: 'OfferItem[]' },
          { name: 'consideration', type: 'ConsiderationItem[]' },
          { name: 'orderType', type: 'uint8' },
          { name: 'startTime', type: 'uint256' },
          { name: 'endTime', type: 'uint256' },
          { name: 'zoneHash', type: 'bytes32' },
          { name: 'salt', type: 'uint256' },
          { name: 'conduitKey', type: 'bytes32' },
          { name: 'counter', type: 'uint256' }
        ],
        OfferItem: [
          { name: 'itemType', type: 'uint8' },
          { name: 'token', type: 'address' },
          { name: 'identifierOrCriteria', type: 'uint256' },
          { name: 'startAmount', type: 'uint256' },
          { name: 'endAmount', type: 'uint256' }
        ],
        ConsiderationItem: [
          { name: 'itemType', type: 'uint8' },
          { name: 'token', type: 'address' },
          { name: 'identifierOrCriteria', type: 'uint256' },
          { name: 'startAmount', type: 'uint256' },
          { name: 'endAmount', type: 'uint256' },
          { name: 'recipient', type: 'address' }
        ]
      },
      message: {
        offerer: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
        zone: '0x0000000000000000000000000000000000000000',
        offer: [
          {
            itemType: 2,  // ERC721
            token: '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D', // BAYC
            identifierOrCriteria: '1234',
            startAmount: '1',
            endAmount: '1'
          }
        ],
        consideration: [
          {
            itemType: 0,  // NATIVE (ETH)
            token: '0x0000000000000000000000000000000000000000',
            identifierOrCriteria: '0',
            startAmount: '75000000000000000000', // 75 ETH
            endAmount: '75000000000000000000',
            recipient: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045'
          },
          {
            itemType: 0,  // NATIVE (ETH) — platform fee
            token: '0x0000000000000000000000000000000000000000',
            identifierOrCriteria: '0',
            startAmount: '1875000000000000000', // 1.875 ETH (2.5% fee)
            endAmount: '1875000000000000000',
            recipient: '0x0000a26b00c1F0DF003000390027140000fAa719' // OpenSea fee recipient
          }
        ],
        orderType: 0, // FULL_OPEN
        startTime: '1700000000',
        endTime: '1735689600',
        zoneHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
        salt: '12345',
        conduitKey: '0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000',
        counter: '0'
      }
    },
    expected: {
      shouldSucceed: true,
      primaryType: 'OrderComponents',
      intentContains: 'Seaport',
      hasFields: ['offerer', 'offer', 'consideration']
    }
  }));

  // Test 2: ERC-20 for ERC-721 trade (buying an NFT with WETH)
  results.push(await harness.runEIP712Test({
    name: 'Seaport Order: buy NFT with WETH',
    typedData: {
      domain: {
        name: 'Seaport',
        version: '1.6',
        chainId: 1,
        verifyingContract: '0x0000000000000068F116a894984e2DB1123eB395'
      },
      primaryType: 'OrderComponents',
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' }
        ],
        OrderComponents: [
          { name: 'offerer', type: 'address' },
          { name: 'zone', type: 'address' },
          { name: 'offer', type: 'OfferItem[]' },
          { name: 'consideration', type: 'ConsiderationItem[]' },
          { name: 'orderType', type: 'uint8' },
          { name: 'startTime', type: 'uint256' },
          { name: 'endTime', type: 'uint256' },
          { name: 'zoneHash', type: 'bytes32' },
          { name: 'salt', type: 'uint256' },
          { name: 'conduitKey', type: 'bytes32' },
          { name: 'counter', type: 'uint256' }
        ],
        OfferItem: [
          { name: 'itemType', type: 'uint8' },
          { name: 'token', type: 'address' },
          { name: 'identifierOrCriteria', type: 'uint256' },
          { name: 'startAmount', type: 'uint256' },
          { name: 'endAmount', type: 'uint256' }
        ],
        ConsiderationItem: [
          { name: 'itemType', type: 'uint8' },
          { name: 'token', type: 'address' },
          { name: 'identifierOrCriteria', type: 'uint256' },
          { name: 'startAmount', type: 'uint256' },
          { name: 'endAmount', type: 'uint256' },
          { name: 'recipient', type: 'address' }
        ]
      },
      message: {
        offerer: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
        zone: '0x0000000000000000000000000000000000000000',
        offer: [
          {
            itemType: 1,  // ERC20
            token: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
            identifierOrCriteria: '0',
            startAmount: '50000000000000000000', // 50 WETH
            endAmount: '50000000000000000000'
          }
        ],
        consideration: [
          {
            itemType: 2,  // ERC721
            token: '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D',
            identifierOrCriteria: '5678',
            startAmount: '1',
            endAmount: '1',
            recipient: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045'
          }
        ],
        orderType: 0,
        startTime: '1700000000',
        endTime: '1735689600',
        zoneHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
        salt: '67890',
        conduitKey: '0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000',
        counter: '1'
      }
    },
    expected: {
      shouldSucceed: true,
      primaryType: 'OrderComponents',
      intentContains: 'Seaport'
    }
  }));

  return results;
}
