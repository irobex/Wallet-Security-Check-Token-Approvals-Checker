import { fetchTrc20TransactionsForAccount, type TronGridTrc20Tx } from "./trongrid.js";
import { TRON_USDT_CONTRACT, usdtToMicro } from "./usdt_trc20.js";
import { logger } from "../../core/logger.js";

export type IncomingPaymentMatch = {
  txHash: string;
  paidAmountUsdt: string;
  paidAmountMicro: bigint;
};

function safeLower(s: string | undefined): string {
  return (s ?? "").toLowerCase();
}

function toUsdtStringFromMicro(micro: bigint): string {
  const sign = micro < 0n ? "-" : "";
  const v = micro < 0n ? -micro : micro;
  const intPart = v / 1_000_000n;
  const fracPart = v % 1_000_000n;
  return `${sign}${intPart.toString()}.${fracPart.toString().padStart(6, "0")}`;
}

function tronValueToMicro(tx: TronGridTrc20Tx): bigint | null {
  const value = tx.value?.trim();
  if (!value) return null;

  // TronGrid for TRC20 often returns integer minimal-units (e.g. "3000000" for 3 USDT).
  if (/^\d+$/.test(value)) return BigInt(value);

  // Some providers may return decimal string in token units.
  // For USDT TRC20 we assume 6 decimals.
  try {
    return usdtToMicro(value);
  } catch {
    return null;
  }
}

/**
 * Find the first incoming USDT TRC20 transfer to the given address that is >= expected amount.
 * Note: We intentionally accept >= to avoid blocking user for tiny fee differences.
 */
export async function findIncomingUsdtPayment(args: {
  payAddress: string;
  expectedAmountUsdt: string; // "25.00"
}): Promise<IncomingPaymentMatch | null> {
  const expectedMicro = usdtToMicro(args.expectedAmountUsdt);
  const txs = await fetchTrc20TransactionsForAccount({
    account: args.payAddress,
    contractAddress: TRON_USDT_CONTRACT,
    onlyConfirmed: true,
    limit: 50
  });

  const incomingToAddr = txs.filter((t) => safeLower(t.to) === safeLower(args.payAddress));
  if (incomingToAddr.length > 0) {
    let bestMicro = 0n;
    let bestValue = "";
    let bestTx = "";
    for (const tx of incomingToAddr) {
      try {
        const micro = tronValueToMicro(tx);
        if (micro === null) continue;
        if (micro > bestMicro) {
          bestMicro = micro;
          bestValue = toUsdtStringFromMicro(micro);
          bestTx = tx.transaction_id ?? "";
        }
      } catch {
        // ignore parse errors
      }
    }
    // Helpful diagnostics: we see incoming transfers but none satisfy the expected amount rule.
    if (bestMicro > 0n && bestMicro < expectedMicro) {
      logger.warn(
        `Incoming USDT seen for ${args.payAddress}, but amount is below expected: best=${bestValue} (< ${args.expectedAmountUsdt}). tx=${bestTx}`
      );
    }
  }

  // TronGrid list is usually newest-first, but we don't rely on it.
  for (const tx of txs) {
    if (safeLower(tx.to) !== safeLower(args.payAddress)) continue;

    const micro = tronValueToMicro(tx);
    if (micro === null) continue;

    if (micro < expectedMicro) continue;
    if (!tx.transaction_id) continue;

    return {
      txHash: tx.transaction_id,
      paidAmountUsdt: toUsdtStringFromMicro(micro),
      paidAmountMicro: micro
    };
  }

  return null;
}


