import { pool } from "../pool.js";

export type TokenMetadata = {
  chainId: number;
  tokenAddress: string;
  symbol: string | null;
  name: string | null;
  decimals: number | null;
  updatedAt: Date;
};

type Row = {
  chain_id: number;
  token_address: string;
  symbol: string | null;
  name: string | null;
  decimals: number | null;
  updated_at: Date;
};

export async function getTokenMetadata(args: {
  chainId: number;
  tokenAddress: string;
}): Promise<TokenMetadata | null> {
  const q = await pool.query<Row>(
    "SELECT * FROM token_metadata WHERE chain_id = $1 AND token_address = $2 LIMIT 1",
    [args.chainId, args.tokenAddress]
  );
  const r = q.rows[0];
  if (!r) return null;
  return {
    chainId: r.chain_id,
    tokenAddress: r.token_address,
    symbol: r.symbol,
    name: r.name,
    decimals: r.decimals,
    updatedAt: r.updated_at
  };
}

export async function upsertTokenMetadata(args: {
  chainId: number;
  tokenAddress: string;
  symbol: string | null;
  name: string | null;
  decimals: number | null;
}): Promise<void> {
  await pool.query(
    `
    INSERT INTO token_metadata (chain_id, token_address, symbol, name, decimals, updated_at)
    VALUES ($1,$2,$3,$4,$5, now())
    ON CONFLICT (chain_id, token_address) DO UPDATE
    SET symbol = EXCLUDED.symbol,
        name = EXCLUDED.name,
        decimals = EXCLUDED.decimals,
        updated_at = now()
    `,
    [args.chainId, args.tokenAddress, args.symbol, args.name, args.decimals]
  );
}


