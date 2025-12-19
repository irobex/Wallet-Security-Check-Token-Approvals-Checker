export const TRON_USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
export const USDT_DECIMALS = 6;

/**
 * Converts decimal string like "25.00" to micro-units (6 decimals) as bigint.
 * Rounds DOWN (safe for ">= expected" rule).
 */
export function usdtToMicro(amount: string): bigint {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error(`Invalid USDT amount: ${amount}`);

  const [intPart, fracRaw = ""] = trimmed.split(".");
  const frac = (fracRaw + "0".repeat(USDT_DECIMALS)).slice(0, USDT_DECIMALS);
  return BigInt(intPart) * 10n ** BigInt(USDT_DECIMALS) + BigInt(frac);
}


