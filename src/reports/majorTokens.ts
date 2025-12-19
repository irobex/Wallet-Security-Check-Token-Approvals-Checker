// Mainnet major token list (minimal MVP).
// Addresses must be lowercase.
const MAJOR_TOKEN_ADDRESSES = new Set<string>([
  // WETH
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  // USDT
  "0xdac17f958d2ee523a2206206994597c13d831ec7",
  // USDC
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  // DAI
  "0x6b175474e89094c44da98b954eedeac495271d0f",
  // WBTC
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599"
]);

export function isMajorToken(chainId: number, tokenAddress: string): boolean {
  if (chainId !== 1) return false;
  return MAJOR_TOKEN_ADDRESSES.has(tokenAddress.toLowerCase());
}


