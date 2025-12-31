/**
 * Token Registry
 *
 * Provides token metadata (symbol, decimals) for common ERC-20 tokens
 * Used to format amounts as "1,000 USDC" instead of raw "1000000"
 */

// Mainnet token addresses (lowercase for matching)
export const KNOWN_TOKENS = {
  // Stablecoins
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { symbol: 'USDC', decimals: 6, name: 'USD Coin' },
  '0xdac17f958d2ee523a2206206994597c13d831ec7': { symbol: 'USDT', decimals: 6, name: 'Tether USD' },
  '0x6b175474e89094c44da98b954eedeac495271d0f': { symbol: 'DAI', decimals: 18, name: 'Dai Stablecoin' },
  '0x4fabb145d64652a948d72533023f6e7a623c7c53': { symbol: 'BUSD', decimals: 18, name: 'Binance USD' },
  '0x853d955acef822db058eb8505911ed77f175b99e': { symbol: 'FRAX', decimals: 18, name: 'Frax' },

  // ETH derivatives
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { symbol: 'WETH', decimals: 18, name: 'Wrapped Ether' },
  '0xae7ab96520de3a18e5e111b5eaab095312d7fe84': { symbol: 'stETH', decimals: 18, name: 'Lido Staked ETH' },
  '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0': { symbol: 'wstETH', decimals: 18, name: 'Wrapped stETH' },
  '0xbe9895146f7af43049ca1c1ae358b0541ea49704': { symbol: 'cbETH', decimals: 18, name: 'Coinbase Wrapped Staked ETH' },
  '0xae78736cd615f374d3085123a210448e74fc6393': { symbol: 'rETH', decimals: 18, name: 'Rocket Pool ETH' },

  // Major tokens
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': { symbol: 'WBTC', decimals: 8, name: 'Wrapped BTC' },
  '0x514910771af9ca656af840dff83e8264ecf986ca': { symbol: 'LINK', decimals: 18, name: 'Chainlink' },
  '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': { symbol: 'UNI', decimals: 18, name: 'Uniswap' },
  '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9': { symbol: 'AAVE', decimals: 18, name: 'Aave' },
  '0xc00e94cb662c3520282e6f5717214004a7f26888': { symbol: 'COMP', decimals: 18, name: 'Compound' },

  // Fluid Protocol
  '0x9fb7b4477576fe5b32be4c1843afb1e55f251b33': { symbol: 'fUSDC', decimals: 6, name: 'Fluid USDC' },

  // Aave tokens
  '0x028171bca77440897b824ca71d1c56cac55b68a3': { symbol: 'aDAI', decimals: 18, name: 'Aave DAI' },
  '0xbcca60bb61934080951369a648fb03df4f96263c': { symbol: 'aUSDC', decimals: 6, name: 'Aave USDC' },

  // Compound tokens
  '0x5d3a536e4d6dbd6114cc1ead35777bab948e3643': { symbol: 'cDAI', decimals: 8, name: 'Compound DAI' },
  '0x39aa39c021dfbae8fac545936693ac917d5e7563': { symbol: 'cUSDC', decimals: 8, name: 'Compound USDC' }
};

/**
 * Get token info by address
 * @param {string} address - Token contract address
 * @returns {Object|null} - Token info {symbol, decimals, name} or null if unknown
 */
export function getTokenInfo(address) {
  if (!address) return null;
  return KNOWN_TOKENS[address.toLowerCase()] || null;
}

/**
 * Get token symbol by address
 * @param {string} address - Token contract address
 * @returns {string} - Token symbol or shortened address
 */
export function getTokenSymbol(address) {
  const token = getTokenInfo(address);
  if (token) return token.symbol;
  // Return shortened address if unknown
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Unknown';
}

/**
 * Get token decimals by address
 * @param {string} address - Token contract address
 * @returns {number} - Token decimals (defaults to 18 if unknown)
 */
export function getTokenDecimals(address) {
  const token = getTokenInfo(address);
  return token ? token.decimals : 18;
}

/**
 * Format token amount with symbol
 * @param {string|bigint} rawAmount - Raw token amount
 * @param {string} tokenAddress - Token contract address
 * @returns {string} - Formatted amount like "1,000.50 USDC"
 */
export function formatTokenAmount(rawAmount, tokenAddress) {
  const token = getTokenInfo(tokenAddress);
  const decimals = token ? token.decimals : 18;
  const symbol = token ? token.symbol : '';

  try {
    const amount = BigInt(rawAmount);
    const divisor = BigInt(10) ** BigInt(decimals);
    const integerPart = amount / divisor;
    const fractionalPart = amount % divisor;

    // Format integer part with commas
    const intStr = integerPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    // Format fractional part (trim trailing zeros, keep at least 2)
    let fracStr = fractionalPart.toString().padStart(decimals, '0');
    fracStr = fracStr.replace(/0+$/, '') || '0';
    if (fracStr.length < 2 && fracStr !== '0') fracStr = fracStr.padEnd(2, '0');

    const formatted = fracStr === '0' ? intStr : `${intStr}.${fracStr}`;
    return symbol ? `${formatted} ${symbol}` : formatted;
  } catch (e) {
    return rawAmount.toString();
  }
}

export default {
  KNOWN_TOKENS,
  getTokenInfo,
  getTokenSymbol,
  getTokenDecimals,
  formatTokenAmount
};
