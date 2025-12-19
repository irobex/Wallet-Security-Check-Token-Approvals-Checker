import * as TW from "tronweb";
import { TRON_USDT_CONTRACT } from "./usdt_trc20.js";
import { logger } from "../../core/logger.js";

const TronWeb = TW.TronWeb;

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
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
  return txid;
}

export async function sendUsdtTrc20(args: {
  apiKey: string;
  fromPrivateKey: string;
  fromAddress: string;
  toAddress: string;
  amountMicro: bigint;
}): Promise<string> {
  const tronWeb = createTronWeb({ apiKey: args.apiKey, privateKey: args.fromPrivateKey });
  tronWeb.setAddress(args.fromAddress);
  const c = await tronWeb.contract().at(TRON_USDT_CONTRACT);
  const txid = await c
    .transfer(args.toAddress, args.amountMicro.toString())
    .send({ feeLimit: 30_000_000 }); // sun
  if (!txid) throw new Error("USDT transfer failed: empty txid");
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
  topupTrx: number;
}): Promise<{ topupTx?: string; sweepTx: string }> {
  // Check TRX on pay address
  const payTrxSun = await getTrxBalanceSun({ apiKey: args.apiKey, address: args.payAddress });
  if (payTrxSun < Math.floor(args.topupTrx * 1e6)) {
    logger.info(`sweep: topup TRX ${args.topupTrx} -> ${args.payAddress} (current ${payTrxSun / 1e6} TRX)`);
    const topupTx = await sendTrx({
      apiKey: args.apiKey,
      fromPrivateKey: args.treasuryPrivateKey,
      toAddress: args.payAddress,
      amountTrx: args.topupTrx
    });
    // Give Tron time to confirm so energy/balance is usable
    await sleep(8_000);
    // best-effort: wait one more time for confirmations
    await sleep(8_000);
    const sweepTx = await sendUsdtTrc20({
      apiKey: args.apiKey,
      fromPrivateKey: args.payPrivateKey,
      fromAddress: args.payAddress,
      toAddress: args.sweepToAddress,
      amountMicro: args.amountMicro
    });
    return { topupTx, sweepTx };
  }

  const sweepTx = await sendUsdtTrc20({
    apiKey: args.apiKey,
    fromPrivateKey: args.payPrivateKey,
    fromAddress: args.payAddress,
    toAddress: args.sweepToAddress,
    amountMicro: args.amountMicro
  });
  return { sweepTx };
}


