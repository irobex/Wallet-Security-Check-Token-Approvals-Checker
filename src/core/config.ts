import "dotenv/config";

function mustGetEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

function getEnv(key: string, defaultValue?: string): string | undefined {
  const v = process.env[key];
  return v ?? defaultValue;
}

export const config = {
  botToken: getEnv("BOT_TOKEN"),
  adminTelegramId: getEnv("ADMIN_TELEGRAM_ID"),
  databaseUrl: getEnv("DATABASE_URL"),
  ethRpcUrl: getEnv("ETH_RPC_URL"),
  tronMnemonic: getEnv("TRON_MNEMONIC"),
  trongridApiKey: getEnv("TRONGRID_API_KEY"),
  reportsStoragePath: getEnv("REPORTS_STORAGE_PATH", "./data/reports")!,

  // TRON treasury / sweeping (optional)
  tronSweepEnabled: getEnv("TRON_SWEEP_ENABLED", "false") === "true",
  tronSweepToAddress: getEnv("TRON_SWEEP_TO_ADDRESS"), // base58 T...
  tronTreasuryHdIndex: Number(getEnv("TRON_TREASURY_HD_INDEX", "0")),
  tronSweepTopupTrx: Number(getEnv("TRON_SWEEP_TOPUP_TRX", "10")), // how much TRX to send to pay address before sweeping USDT

  ethApprovalsFromBlock: Number(getEnv("ETH_APPROVALS_FROM_BLOCK", "0")),
  // Safer defaults for RPC providers like Infura (reduce risk of OOM / eth_getLogs limits).
  ethApprovalsChunkSize: Number(getEnv("ETH_APPROVALS_CHUNK_SIZE", "5000")),
  ethApprovalsMaxRangeBlocks: Number(getEnv("ETH_APPROVALS_MAX_RANGE_BLOCKS", "200000")),

  // Helpers for parts that must fail fast:
  mustGetEnv
};


