import * as TW from "tronweb";
import { TRON_USDT_CONTRACT } from "./usdt_trc20.js";
import { logger } from "../../core/logger.js";
import { delegateResourceTo, ensureTreasuryFrozenForEnergy, undelegateResourceFrom } from "./delegation.js";

const TronWeb = TW.TronWeb;

const USDT_FEE_LIMIT_SUN = 30_000_000; // 30 TRX max burn (acts as safety cap)

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
    .send({ feeLimit: args.feeLimitSun ?? USDT_FEE_LIMIT_SUN });

  if (!txid) throw new Error("USDT transfer failed: empty txid");

  const info = await waitForTxFinalization({ tronWeb, txid: String(txid) });
  assertTxSuccess(info, String(txid));

  // Helpful economics logging
  const feeSun = Number(info?.fee ?? 0);
  const energyFeeSun = Number(info?.receipt?.energy_fee ?? 0);
  const netFeeSun = Number(info?.receipt?.net_fee ?? 0);
  logger.info(
    `sweep: USDT tx=${String(txid)} fee=${(feeSun / 1e6).toFixed(6)} TRX (energy=${(energyFeeSun / 1e6).toFixed(6)}, net=${(
      netFeeSun / 1e6
    ).toFixed(6)})`
  );

  return String(txid);
}

export type TronDelegationConfig = {
  enabled: boolean;
  freezeTrx: number;
  delegateEnergyTrx: number;
  delegateBandwidthTrx: number;
  undelegateAfter: boolean;
  minPayTrx: number;
};

/**
 * Funds a pay address with TRX (net/bandwidth) and sweeps USDT to treasury.
 * Optionally uses TRON resource delegation (freeze+delegate ENERGY) to reduce TRX burn.
 */
export async function sweepUsdtToTreasury(args: {
  apiKey: string;
  treasuryPrivateKey: string;
  treasuryAddress: string;
  payPrivateKey: string;
  payAddress: string;
  sweepToAddress: string;
  amountMicro: bigint;
  /** fallback target TRX balance to keep on pay address before sweeping (when delegation is disabled) */
  topupTrx: number;
  delegation?: TronDelegationConfig;
}): Promise<{
  topupTxs?: string[];
  freezeTx?: string;
  delegateTxs?: string[];
  undelegateTxs?: string[];
  sweepTx: string;
}> {
  const topupTxs: string[] = [];
  const delegateTxs: string[] = [];
  const undelegateTxs: string[] = [];

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

  const delegation = args.delegation;
  const useDelegation = Boolean(delegation?.enabled);

  // With delegation enabled, pay address only needs a tiny TRX balance for net fee/bandwidth.
  // Without delegation, we keep a larger TRX balance to cover energy burn.
  await ensurePayHasTrx(useDelegation ? Math.max(0, delegation!.minPayTrx) : args.topupTrx);

  let freezeTx: string | undefined;

  if (useDelegation) {
    freezeTx = (await ensureTreasuryFrozenForEnergy({
      apiKey: args.apiKey,
      treasuryAddress: args.treasuryAddress,
      treasuryPrivateKey: args.treasuryPrivateKey,
      freezeTrx: delegation!.freezeTrx
    })) ?? undefined;

    const d1 = await delegateResourceTo({
      apiKey: args.apiKey,
      treasuryAddress: args.treasuryAddress,
      treasuryPrivateKey: args.treasuryPrivateKey,
      receiverAddress: args.payAddress,
      resource: "ENERGY",
      delegateTrx: delegation!.delegateEnergyTrx
    });
    if (d1) delegateTxs.push(d1);

    const d2 = await delegateResourceTo({
      apiKey: args.apiKey,
      treasuryAddress: args.treasuryAddress,
      treasuryPrivateKey: args.treasuryPrivateKey,
      receiverAddress: args.payAddress,
      resource: "BANDWIDTH",
      delegateTrx: delegation!.delegateBandwidthTrx
    });
    if (d2) delegateTxs.push(d2);
  }

  let sweepTx: string;
  try {
    sweepTx = await sendUsdtTrc20({
      apiKey: args.apiKey,
      fromPrivateKey: args.payPrivateKey,
      fromAddress: args.payAddress,
      toAddress: args.sweepToAddress,
      amountMicro: args.amountMicro,
      feeLimitSun: USDT_FEE_LIMIT_SUN
    });
  } finally {
    if (useDelegation && delegation!.undelegateAfter) {
      const u1 = await undelegateResourceFrom({
        apiKey: args.apiKey,
        treasuryAddress: args.treasuryAddress,
        treasuryPrivateKey: args.treasuryPrivateKey,
        receiverAddress: args.payAddress,
        resource: "ENERGY",
        delegateTrx: delegation!.delegateEnergyTrx
      }).catch((e) => {
        logger.warn(`delegation: failed to undelegate ENERGY (best-effort): ${(e as Error)?.message ?? String(e)}`);
        return null;
      });
      if (u1) undelegateTxs.push(u1);

      const u2 = await undelegateResourceFrom({
        apiKey: args.apiKey,
        treasuryAddress: args.treasuryAddress,
        treasuryPrivateKey: args.treasuryPrivateKey,
        receiverAddress: args.payAddress,
        resource: "BANDWIDTH",
        delegateTrx: delegation!.delegateBandwidthTrx
      }).catch((e) => {
        logger.warn(`delegation: failed to undelegate BANDWIDTH (best-effort): ${(e as Error)?.message ?? String(e)}`);
        return null;
      });
      if (u2) undelegateTxs.push(u2);
    }
  }

  const res: any = { sweepTx };
  if (topupTxs.length) res.topupTxs = topupTxs;
  if (freezeTx) res.freezeTx = freezeTx;
  if (delegateTxs.length) res.delegateTxs = delegateTxs;
  if (undelegateTxs.length) res.undelegateTxs = undelegateTxs;
  return res;
}
