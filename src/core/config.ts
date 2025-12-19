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
  reportsStoragePath: getEnv("REPORTS_STORAGE_PATH", "./data/reports")!,

  // Payments aggregator (NOWPayments)
  nowpaymentsApiKey: getEnv("NOWPAYMENTS_API_KEY"),
  nowpaymentsBaseUrl: getEnv("NOWPAYMENTS_BASE_URL", "https://api.nowpayments.io")!,
  // IMPORTANT: Using fiat (usd) can cause NOWPayments to convert and fail minimal-amount checks
  // (e.g. 3 USD -> 2.98 usdttrc20). Default to pricing directly in the pay currency.
  nowpaymentsPriceCurrency: getEnv("NOWPAYMENTS_PRICE_CURRENCY", "usdttrc20")!,
  nowpaymentsPayCurrency: getEnv("NOWPAYMENTS_PAY_CURRENCY", "usdttrc20")!,


  ethApprovalsFromBlock: Number(getEnv("ETH_APPROVALS_FROM_BLOCK", "0")),
  // Safer defaults for RPC providers like Infura (reduce risk of OOM / eth_getLogs limits).
  ethApprovalsChunkSize: Number(getEnv("ETH_APPROVALS_CHUNK_SIZE", "5000")),
  ethApprovalsMaxRangeBlocks: Number(getEnv("ETH_APPROVALS_MAX_RANGE_BLOCKS", "200000")),

  // Helpers for parts that must fail fast:
  mustGetEnv
};


