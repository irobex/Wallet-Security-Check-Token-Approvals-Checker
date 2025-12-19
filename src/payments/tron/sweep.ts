import * as TW from "tronweb";
import { TRON_USDT_CONTRACT } from "./usdt_trc20.js";
import { logger } from "../../core/logger.js";

const TronWeb = TW.TronWeb;

const USDT_FEE_LIMIT_PRIMARY_SUN = 120_000_000; // 120 TRX max burn
const USDT_FEE_LIMIT_RETRY_SUN = 200_000_000; // 200 TRX max burn (fallback)

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

function decodeHexMessage(hex?: string): string | undefined {
  if (!hex) return undefined;
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) return undefined;
  try {
    return Buffer.from(clean, "hex").toString("utf8");
  } catch {
    return undefined;
  }
}

export function createTronWeb(args: { apiKey: string; privateKey?: string }) {
  return new TronWeb({
    fullHost: "https://api.trongrid.io",
    privateKey: args.privateKey,
    headers: { "TRON-PRO-API-KEY": args.apiKey }
  });
}

export async function getTrxBalanceSun(args: { apiKey: string; address: string }): Promise<number> {
  const tronWeb = createTronWeb({ apiKey: args.apiKey });
  return await tronWeb.trx.getBalance(args.address);
}

async function waitForTxFinalization(args: {
  tronWeb: any;
  txid: string;
  timeoutMs?: number;
  pollMs?: number;
}): Promise<any> {
  const timeoutMs = args.timeoutMs ?? 90_000;
  const pollMs = args.pollMs ?? 3_000;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const info = await args.tronWeb.trx.getTransactionInfo(args.txid).catch(() => undefined);
    if (info && (info.receipt || info.result || info.blockNumber)) return info;
    await sleep(pollMs);
  }
  throw new Error(`TRON tx not finalized in time: ${args.txid}`);
}

function assertTxSuccess(info: any, txid: string) {
  const receiptResult = info?.receipt?.result;
  const topLevelResult = info?.result;
  if (topLevelResult === "FAILED" || (receiptResult && receiptResult !== "SUCCESS")) {
    const resMessageHex = typeof info?.resMessage === "string" ? info.resMessage : undefined;
    const decoded = decodeHexMessage(resMessageHex);
    const msg = decoded ? `${decoded} (hex=${resMessageHex})` : resMessageHex;
    throw new Error(
      `TRON tx failed: ${txid} result=${topLevelResult ?? "?"} receipt=${receiptResult ?? "?"} msg=${msg ?? "—"}`
    );
  }
}

export async function sendTrx(args: {
  apiKey: string;
  fromPrivateKey: string;
  toAddress: string;
  amountTrx: number;
}): Promise<string> {
  const tronWeb = createTronWeb({ apiKey: args.apiKey, privateKey: args.fromPrivateKey });
  const tx = await tronWeb.trx.sendTransaction(args.toAddress, Math.floor(args.amountTrx * 1e6));
  const txid = tx?.txid ?? tx?.transaction?.txID ?? "";
  if (!txid) throw new Error(`TRX send failed: ${JSON.stringify(tx).slice(0, 500)}`);
  // Best-effort confirmation
  const info = await waitForTxFinalization({ tronWeb, txid }).catch(() => undefined);
  if (info) assertTxSuccess(info, txid);
  return txid;
}

export async function sendUsdtTrc20(args: {
  apiKey: string;
  fromPrivateKey: string;
  fromAddress: string;
  toAddress: string;
  amountMicro: bigint;
  feeLimitSun?: number;
}): Promise<string> {
  const tronWeb = createTronWeb({ apiKey: args.apiKey, privateKey: args.fromPrivateKey });
  tronWeb.setAddress(args.fromAddress);
  const c = await tronWeb.contract().at(TRON_USDT_CONTRACT);

  const txid = await c
    .transfer(args.toAddress, args.amountMicro.toString())
    .send({ feeLimit: args.feeLimitSun ?? USDT_FEE_LIMIT_PRIMARY_SUN }); // sun

  if (!txid) throw new Error("USDT transfer failed: empty txid");

  const info = await waitForTxFinalization({ tronWeb, txid: String(txid) });
  assertTxSuccess(info, String(txid));
  return String(txid);
}

/**
 * Funds a pay address with TRX (fee) and sweeps USDT to treasury.
 * This avoids manual TRX topups per order.
 */
export async function sweepUsdtToTreasury(args: {
  apiKey: string;
  treasuryPrivateKey: string;
  treasuryAddress: string;
  payPrivateKey: string;
  payAddress: string;
  sweepToAddress: string;
  amountMicro: bigint;
  /** target TRX balance to keep on pay address before attempting sweep */
  topupTrx: number;
}): Promise<{ topupTxs?: string[]; sweepTx: string }> {
  const topupTxs: string[] = [];

  async function ensurePayHasTrx(targetTrx: number): Promise<void> {
    const payTrxSun = await getTrxBalanceSun({ apiKey: args.apiKey, address: args.payAddress });
    const payTrx = payTrxSun / 1e6;
    if (payTrx >= targetTrx) return;

    const needTrx = Math.ceil((targetTrx - payTrx) * 1e6) / 1e6;
    logger.info(
      `sweep: topup TRX ${needTrx} -> ${args.payAddress} (current ${payTrx.toFixed(6)} TRX, target ${targetTrx})`
    );

    const topupTx = await sendTrx({
      apiKey: args.apiKey,
      fromPrivateKey: args.treasuryPrivateKey,
      toAddress: args.payAddress,
      amountTrx: needTrx
    });
    topupTxs.push(topupTx);
    await sleep(5_000);
  }

  const attempt = async (feeLimitSun: number): Promise<string> => {
    return await sendUsdtTrc20({
      apiKey: args.apiKey,
      fromPrivateKey: args.payPrivateKey,
      fromAddress: args.payAddress,
      toAddress: args.sweepToAddress,
      amountMicro: args.amountMicro,
      feeLimitSun
    });
  };

  await ensurePayHasTrx(args.topupTrx);

  try {
    const sweepTx = await attempt(USDT_FEE_LIMIT_PRIMARY_SUN);
    return topupTxs.length ? { topupTxs, sweepTx } : { sweepTx };
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    if (msg.includes("OUT_OF_ENERGY")) {
      logger.warn(`sweep: OUT_OF_ENERGY, retrying with more TRX + higher feeLimit. err=${msg}`);
      // Ensure significantly more TRX and retry once
      await ensurePayHasTrx(Math.max(args.topupTrx * 3, args.topupTrx + 30));
      const sweepTx = await attempt(USDT_FEE_LIMIT_RETRY_SUN);
      return topupTxs.length ? { topupTxs, sweepTx } : { sweepTx };
    }
    throw e;
  }
}
