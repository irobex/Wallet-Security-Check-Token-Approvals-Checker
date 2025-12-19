import { config } from "../../core/config.js";

export type TronGridTrc20Tx = {
  transaction_id: string;
  token_info?: {
    address?: string;
    decimals?: number | string;
    symbol?: string;
    name?: string;
  };
  from?: string;
  to?: string;
  type?: string;
  value?: string; // typically decimal string in token units
  block_timestamp?: number;
};

type TronGridResponse<T> = {
  data: T[];
};

function normalizeTronAddress(addr: string): string {
  return addr.trim();
}

export async function fetchTrc20TransactionsForAccount(args: {
  account: string; // base58 (T...)
  contractAddress?: string;
  limit?: number;
  onlyConfirmed?: boolean;
}): Promise<TronGridTrc20Tx[]> {
  if (!config.trongridApiKey) {
    throw new Error("TRONGRID_API_KEY is required for TronGrid calls.");
  }

  const account = normalizeTronAddress(args.account);
  const u = new URL(`https://api.trongrid.io/v1/accounts/${account}/transactions/trc20`);
  u.searchParams.set("limit", String(args.limit ?? 50));
  u.searchParams.set("only_confirmed", String(args.onlyConfirmed ?? true));
  if (args.contractAddress) u.searchParams.set("contract_address", args.contractAddress);

  const res = await fetch(u.toString(), {
    headers: {
      "TRON-PRO-API-KEY": config.trongridApiKey
    }
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`TronGrid error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as TronGridResponse<TronGridTrc20Tx>;
  return json.data ?? [];
}


