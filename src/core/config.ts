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

  ethApprovalsFromBlock: Number(getEnv("ETH_APPROVALS_FROM_BLOCK", "0")),
  ethApprovalsChunkSize: Number(getEnv("ETH_APPROVALS_CHUNK_SIZE", "50000")),
  ethApprovalsMaxRangeBlocks: Number(getEnv("ETH_APPROVALS_MAX_RANGE_BLOCKS", "2000000")),

  // Helpers for parts that must fail fast:
  mustGetEnv
};


