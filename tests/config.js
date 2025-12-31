// KaiSign Decoder Test Suite Configuration

export const CONFIG = {
  // Path to extension source files
  extensionPath: '..',

  // Path to test fixtures
  fixturesPath: './fixtures',

  // Default chain ID for tests
  defaultChainId: 1,

  // Etherscan API (loaded from .env)
  etherscanApiKey: process.env.ETHERSCAN_API_KEY || '',

  // API endpoints
  apis: {
    etherscan: 'https://api.etherscan.io/api',
    kaisign: 'https://kai-sign-production.up.railway.app/api/py/contract'
  }
};

// All protocol contracts with their addresses and key functions
export const CONTRACTS = {
  // DEX Protocols
  dex: {
    uniswapUniversalRouter: {
      name: 'Uniswap Universal Router',
      address: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
      chainId: 1,
      functions: ['execute'],
      metadataFile: 'dex/uniswap-universal-router.json'
    },
    permit2: {
      name: 'Permit2',
      address: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
      chainId: 1,
      functions: ['permit', 'permitTransferFrom', 'permitWitnessTransferFrom', 'permitBatch'],
      metadataFile: 'dex/uniswap-permit2.json'
    },
    uniswapV3Factory: {
      name: 'Uniswap V3 Factory',
      address: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      chainId: 1,
      functions: ['createPool', 'setOwner', 'enableFeeAmount'],
      metadataFile: 'dex/uniswap-v3-factory.json'
    },
    uniswapV2Factory: {
      name: 'Uniswap V2 Factory',
      address: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
      chainId: 1,
      functions: ['createPair', 'setFeeTo', 'setFeeToSetter'],
      metadataFile: 'dex/uniswap-v2-factory.json'
    },
    uniswapQuoterV2: {
      name: 'Uniswap Quoter V2',
      address: '0x61fFe014bA17989E743c5F6cB21bF9697530B21e',
      chainId: 1,
      functions: ['quoteExactInput', 'quoteExactInputSingle', 'quoteExactOutput', 'quoteExactOutputSingle'],
      metadataFile: 'dex/uniswap-quoter-v2.json'
    },
    oneInchRouterV6: {
      name: '1inch Aggregation Router V6',
      address: '0x111111125421ca6dc452d289314280a0f8842a65',
      chainId: 1,
      functions: ['swap', 'unoswap', 'unoswapTo', 'uniswapV3Swap', 'clipperSwap', 'fillOrder', 'fillOrderArgs'],
      metadataFile: 'dex/1inch-aggregation-router-v6.json'
    },
    oneInchLimitOrderV4: {
      name: '1inch Limit Order Protocol V4',
      address: '0x1111111254EEB25477B68fb85Ed929f73A960582',
      chainId: 1,
      functions: ['fillOrder', 'fillOrderRFQ', 'cancelOrder'],
      metadataFile: 'dex/1inch-limit-order-v4.json'
    },
    curveAddressProvider: {
      name: 'Curve Address Provider',
      address: '0x0000000022D53366457F9d5E68Ec105046FC4383',
      chainId: 1,
      functions: ['get_registry', 'get_address'],
      metadataFile: 'dex/curve-address-provider.json'
    },
    curveRegistry: {
      name: 'Curve Registry',
      address: '0x90E00ACe148ca3b23Ac1bC8C240C2a7Dd9c2d7f5',
      chainId: 1,
      functions: ['get_pool_from_lp_token', 'get_lp_token', 'get_coins'],
      metadataFile: 'dex/curve-registry.json'
    },
    curveRouter: {
      name: 'Curve Router',
      address: '0xF0d4c12A5768727170B5045037d58961b3c93541',
      chainId: 1,
      functions: ['exchange', 'exchange_multiple'],
      metadataFile: 'dex/curve-router.json'
    }
  },

  // Lending Protocols
  lending: {
    aaveV3Pool: {
      name: 'Aave V3 Pool',
      address: '0x87870B27F51f6D0b9e7a0033666BE7F97f8BAF69',
      chainId: 1,
      functions: ['supply', 'withdraw', 'borrow', 'repay', 'liquidationCall', 'flashLoan', 'setUserUseReserveAsCollateral'],
      metadataFile: 'lending/aave-v3-pool.json'
    },
    aaveV3PoolAddressesProvider: {
      name: 'Aave V3 Pool Addresses Provider',
      address: '0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e',
      chainId: 1,
      functions: ['getPool', 'getPoolConfigurator', 'getPriceOracle', 'setPoolImpl'],
      metadataFile: 'lending/aave-v3-pool-addresses-provider.json'
    },
    aaveV3Oracle: {
      name: 'Aave V3 Oracle',
      address: '0x54586bE25E38627031640203f90114948842E530',
      chainId: 1,
      functions: ['getAssetPrice', 'getAssetsPrices', 'setAssetSources'],
      metadataFile: 'lending/aave-v3-oracle.json'
    },
    compoundV3cUSDC: {
      name: 'Compound V3 cUSDCv3',
      address: '0xc3d688B66703497DAA19211EEdff47f25384cdc3',
      chainId: 1,
      functions: ['supply', 'supplyTo', 'supplyFrom', 'withdraw', 'withdrawTo', 'withdrawFrom', 'absorb', 'buyCollateral'],
      metadataFile: 'lending/compound-v3-cusdc.json'
    },
    compoundV3cWETH: {
      name: 'Compound V3 cWETHv3',
      address: '0xA17581A9E3356d9A858b789D68B4d866e593aE94',
      chainId: 1,
      functions: ['supply', 'supplyTo', 'withdraw', 'withdrawTo'],
      metadataFile: 'lending/compound-v3-cweth.json'
    },
    makerVat: {
      name: 'MakerDAO Vat',
      address: '0x35D1b3F3D7966A1DFe207aa4514C12a259A0492B',
      chainId: 1,
      functions: ['frob', 'fork', 'hope', 'nope', 'move', 'flux'],
      metadataFile: 'lending/maker-vat.json'
    },
    makerJug: {
      name: 'MakerDAO Jug',
      address: '0x19c0976f590D67707E62397C87829d896Dc0f1F1',
      chainId: 1,
      functions: ['drip', 'file'],
      metadataFile: 'lending/maker-jug.json'
    },
    makerPot: {
      name: 'MakerDAO Pot (DSR)',
      address: '0x197E90f9FAD81970bA7976f33CbD77088E5D7cf7',
      chainId: 1,
      functions: ['join', 'exit', 'drip'],
      metadataFile: 'lending/maker-pot.json'
    }
  },

  // Staking Protocols
  staking: {
    lidoStETH: {
      name: 'Lido stETH',
      address: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
      chainId: 1,
      functions: ['submit', 'approve', 'transfer', 'transferFrom'],
      metadataFile: 'staking/lido-steth.json'
    },
    lidoWstETH: {
      name: 'Lido wstETH',
      address: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0',
      chainId: 1,
      functions: ['wrap', 'unwrap', 'approve', 'transfer'],
      metadataFile: 'staking/lido-wsteth.json'
    },
    lidoWithdrawalQueue: {
      name: 'Lido Withdrawal Queue',
      address: '0x889edC2BdB48866702480d17344cD3124Ac9681E',
      chainId: 1,
      functions: ['requestWithdrawals', 'requestWithdrawalsWstETH', 'claimWithdrawals', 'claimWithdrawal'],
      metadataFile: 'staking/lido-withdrawal-queue.json'
    },
    rocketPoolStorage: {
      name: 'Rocket Pool Storage',
      address: '0x1d8f8f00cfa6758d7bE78336684788Fb0ee0Fa46',
      chainId: 1,
      functions: ['getAddress', 'setAddress', 'getBool', 'getUint'],
      metadataFile: 'staking/rocketpool-storage.json'
    },
    rocketPoolrETH: {
      name: 'Rocket Pool rETH',
      address: '0xae78736Cd615f374D3085123A210448E74Fc6393',
      chainId: 1,
      functions: ['burn', 'approve', 'transfer', 'transferFrom'],
      metadataFile: 'staking/rocketpool-reth.json'
    },
    rocketPoolDepositPool: {
      name: 'Rocket Pool Deposit Pool',
      address: '0xDD3f50F8A6CafbE9b31a427582963f465E745AF8',
      chainId: 1,
      functions: ['deposit'],
      metadataFile: 'staking/rocketpool-deposit-pool.json'
    }
  },

  // NFT Marketplaces
  nft: {
    seaportV16: {
      name: 'Seaport v1.6',
      address: '0x0000000000000068F116a8949814280a0F8842A6',
      chainId: 1,
      functions: ['fulfillBasicOrder', 'fulfillOrder', 'fulfillAdvancedOrder', 'fulfillAvailableOrders', 'matchOrders', 'cancel', 'validate'],
      metadataFile: 'nft/seaport-v1.6.json'
    },
    seaportConduitController: {
      name: 'Seaport Conduit Controller',
      address: '0x00000000F9490004111C14339127229d9469144C',
      chainId: 1,
      functions: ['createConduit', 'updateChannel', 'transferOwnership'],
      metadataFile: 'nft/seaport-conduit-controller.json'
    }
  },

  // Account Abstraction
  accountAbstraction: {
    safeProxyFactory: {
      name: 'Safe Proxy Factory',
      address: '0x4e1dcf7ad4e460cfd30791ccc4f9c8a4f820ec67',
      chainId: 1,
      functions: ['createProxyWithNonce', 'createProxyWithCallback', 'createChainSpecificProxyWithNonce'],
      metadataFile: 'account-abstraction/safe-proxy-factory.json'
    },
    safeSingleton: {
      name: 'Safe Singleton',
      address: '0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552',
      chainId: 1,
      functions: ['setup', 'execTransaction', 'addOwnerWithThreshold', 'removeOwner', 'changeThreshold', 'enableModule', 'disableModule'],
      metadataFile: 'account-abstraction/safe-singleton.json'
    },
    safeMultiSend: {
      name: 'Safe MultiSend',
      address: '0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761',
      chainId: 1,
      functions: ['multiSend'],
      metadataFile: 'account-abstraction/safe-multisend.json'
    },
    entryPointV06: {
      name: 'ERC-4337 EntryPoint v0.6',
      address: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
      chainId: 1,
      functions: ['handleOps', 'handleAggregatedOps', 'simulateValidation', 'depositTo', 'withdrawTo'],
      metadataFile: 'account-abstraction/erc4337-entrypoint-v0.6.json'
    },
    entryPointV07: {
      name: 'ERC-4337 EntryPoint v0.7',
      address: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
      chainId: 1,
      functions: ['handleOps', 'handleAggregatedOps', 'getUserOpHash', 'depositTo'],
      metadataFile: 'account-abstraction/erc4337-entrypoint-v0.7.json'
    },
    ambireDelegator: {
      name: 'Ambire EIP-7702 Delegator',
      address: '0x5A7FC11397E9a8AD41BF10bf13F22B0a63f96f6d',
      chainId: 1,
      functions: ['execute', 'executeBatch'],
      metadataFile: 'account-abstraction/ambire-delegator.json'
    }
  }
};

// Uniswap Universal Router COMMANDS (offchain commands)
export const UNISWAP_COMMANDS = {
  // V3 Swaps
  V3_SWAP_EXACT_IN: 0x00,
  V3_SWAP_EXACT_OUT: 0x01,
  V3_SWAP_EXACT_IN_SINGLE: 0x02,
  V3_SWAP_EXACT_OUT_SINGLE: 0x03,

  // Permit2
  PERMIT2_PERMIT: 0x04,
  PERMIT2_PERMIT_BATCH: 0x05,

  // Token operations
  SWEEP: 0x06,
  TRANSFER: 0x07,

  // V2 Swaps
  V2_SWAP_EXACT_IN: 0x08,
  V2_SWAP_EXACT_OUT: 0x09,

  // More operations
  PAY_PORTION: 0x0a,
  WRAP_ETH: 0x0b,
  UNWRAP_WETH: 0x0c,
  PERMIT2_TRANSFER_FROM: 0x0d,
  PERMIT2_TRANSFER_FROM_BATCH: 0x0e,
  BALANCE_CHECK_ERC20: 0x0f,

  // NFT Operations
  SEAPORT: 0x10,
  LOOKS_RARE_721: 0x11,
  NFTX: 0x12,
  CRYPTOPUNKS: 0x13,
  LOOKS_RARE_1155: 0x14,
  OWNER_CHECK_721: 0x15,
  OWNER_CHECK_1155: 0x16,
  SWEEP_ERC721: 0x17,
  X2Y2_721: 0x18,
  SUDOSWAP: 0x19,
  NFT20: 0x1a,
  X2Y2_1155: 0x1b,
  FOUNDATION: 0x1c,
  SWEEP_ERC1155: 0x1d
};

// Real EIP-7702 test transaction from Ambire
export const EIP7702_TEST_TX = {
  hash: '0xf82a7507f698c4023520793837be2b1fb942618899a6d43369bb0b37c97731b6',
  type: 4,
  authority: '0x408e2995a8E765E9a417dC98498f7AB773b9Af94',
  delegatedTo: '0x5A7FC11397E9a8AD41BF10bf13F22B0a63f96f6d',
  chainId: 1,
  description: 'Ambire EIP-7702 delegation with USDC approve + Fluid deposit'
};

// Get all contract addresses as flat array
export function getAllContractAddresses() {
  const addresses = [];
  for (const category of Object.values(CONTRACTS)) {
    for (const contract of Object.values(category)) {
      addresses.push({
        address: contract.address,
        name: contract.name,
        chainId: contract.chainId,
        metadataFile: contract.metadataFile
      });
    }
  }
  return addresses;
}
