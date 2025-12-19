import { fetchTrc20TransactionsForAccount } from "./trongrid.js";
import { TRON_USDT_CONTRACT, usdtToMicro } from "./usdt_trc20.js";

export type IncomingPaymentMatch = {
  txHash: string;
  paidAmountUsdt: string;
  paidAmountMicro: bigint;
};

function safeLower(s: string | undefined): string {
  return (s ?? "").toLowerCase();
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

  // TronGrid list is usually newest-first, but we don't rely on it.
  for (const tx of txs) {
    if (safeLower(tx.to) !== safeLower(args.payAddress)) continue;

    // TronGrid returns "value" as decimal string in token units.
    // Example: "25" or "25.000001"
    const value = tx.value;
    if (!value) continue;

    let micro: bigint;
    try {
      micro = usdtToMicro(value);
    } catch {
      continue;
    }

    if (micro < expectedMicro) continue;
    if (!tx.transaction_id) continue;

    return {
      txHash: tx.transaction_id,
      paidAmountUsdt: value,
      paidAmountMicro: micro
    };
  }

  return null;
}


