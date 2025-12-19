export function formatUnitsSafe(value: bigint, decimals: number | null): string {
  if (decimals === null) return value.toString();
  if (decimals === 0) return value.toString();

  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const frac = value % base;

  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return fracStr ? `${whole.toString()}.${fracStr}` : whole.toString();
}


