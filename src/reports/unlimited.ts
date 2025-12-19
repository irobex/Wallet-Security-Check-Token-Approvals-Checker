export const MAX_UINT256 = (1n << 256n) - 1n;

export function unlimitedThresholdRaw(decimals: number): bigint {
  // 10 billion tokens
  return 10n ** BigInt(decimals) * 10_000_000_000n;
}

export function isUnlimited(allowanceRaw: bigint, decimals: number | null): boolean {
  if (allowanceRaw === MAX_UINT256) return true;
  if (decimals === null) return false;
  return allowanceRaw >= unlimitedThresholdRaw(decimals);
}


