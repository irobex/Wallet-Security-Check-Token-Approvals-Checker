import { logger } from "../../core/logger.js";
import { createTronWeb } from "./sweep.js";

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

async function waitForTxFinalization(args: {
  tronWeb: any;
  txid: string;
  timeoutMs?: number;
  pollMs?: number;
}): Promise<any> {
  const timeoutMs = args.timeoutMs ?? 180_000;
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

async function signAndSend(args: { tronWeb: any; tx: any; privateKey: string }): Promise<string> {
  const signed = await args.tronWeb.trx.sign(args.tx, args.privateKey);
  const sent = await args.tronWeb.trx.sendRawTransaction(signed);

  if (sent?.result === false) {
    // TronGrid sometimes returns {result:false, code, message} (message can be hex)
    const rawMsg = typeof sent?.message === "string" ? sent.message : "";
    const decodedMsg = decodeHexMessage(rawMsg);
    throw new Error(
      `TRON broadcast failed: ${decodedMsg ?? rawMsg ?? ""} payload=${JSON.stringify(sent).slice(0, 500)}`
    );
  }

  const txid = sent?.txid ?? sent?.transaction?.txID ?? signed?.txID ?? "";
  if (!txid) throw new Error(`TRON sendRawTransaction failed: ${JSON.stringify(sent).slice(0, 500)}`);

  const info = await waitForTxFinalization({ tronWeb: args.tronWeb, txid });
  assertTxSuccess(info, txid);
  return txid;
}

export async function ensureTreasuryFrozenForEnergy(args: {
  apiKey: string;
  treasuryAddress: string; // base58
  treasuryPrivateKey: string;
  freezeTrx: number;
}): Promise<string | null> {
  if (!(args.freezeTrx > 0)) return null;

  const tronWeb = createTronWeb({ apiKey: args.apiKey, privateKey: args.treasuryPrivateKey });
  tronWeb.setAddress(args.treasuryAddress);

  const res = await tronWeb.trx.getAccountResources(args.treasuryAddress);
  const energyLimit = Number(res?.EnergyLimit ?? 0);
  if (energyLimit > 0) {
    logger.info(`delegation: treasury already has EnergyLimit=${energyLimit}, skip freeze`);
    return null;
  }

  logger.info(`delegation: freezing ${args.freezeTrx} TRX for ENERGY on treasury=${args.treasuryAddress}`);
  const tx = await tronWeb.transactionBuilder.freezeBalanceV2(
    Math.floor(args.freezeTrx * 1e6),
    "ENERGY",
    args.treasuryAddress
  );
  const txid = await signAndSend({ tronWeb, tx, privateKey: args.treasuryPrivateKey });

  // Give network time to update resources
  await sleep(6_000);
  const res2 = await tronWeb.trx.getAccountResources(args.treasuryAddress);
  logger.info(
    `delegation: after freeze EnergyLimit=${Number(res2?.EnergyLimit ?? 0)} EnergyUsed=${Number(res2?.EnergyUsed ?? 0)}`
  );

  return txid;
}

export async function delegateResourceTo(args: {
  apiKey: string;
  treasuryAddress: string;
  treasuryPrivateKey: string;
  receiverAddress: string;
  resource: "ENERGY" | "BANDWIDTH";
  delegateTrx: number;
}): Promise<string | null> {
  if (!(args.delegateTrx > 0)) return null;

  const tronWeb = createTronWeb({ apiKey: args.apiKey, privateKey: args.treasuryPrivateKey });
  tronWeb.setAddress(args.treasuryAddress);

  logger.info(
    `delegation: delegate ${args.delegateTrx} TRX of ${args.resource} from ${args.treasuryAddress} -> ${args.receiverAddress}`
  );

  const tx = await tronWeb.transactionBuilder.delegateResource(
    Math.floor(args.delegateTrx * 1e6),
    args.receiverAddress,
    args.resource,
    args.treasuryAddress,
    false
  );
  const txid = await signAndSend({ tronWeb, tx, privateKey: args.treasuryPrivateKey });
  await sleep(3_000);
  return txid;
}

export async function undelegateResourceFrom(args: {
  apiKey: string;
  treasuryAddress: string;
  treasuryPrivateKey: string;
  receiverAddress: string;
  resource: "ENERGY" | "BANDWIDTH";
  delegateTrx: number;
}): Promise<string | null> {
  if (!(args.delegateTrx > 0)) return null;

  const tronWeb = createTronWeb({ apiKey: args.apiKey, privateKey: args.treasuryPrivateKey });
  tronWeb.setAddress(args.treasuryAddress);

  logger.info(
    `delegation: undelegate ${args.delegateTrx} TRX of ${args.resource} from ${args.treasuryAddress} -> ${args.receiverAddress}`
  );

  const tx = await tronWeb.transactionBuilder.undelegateResource(
    Math.floor(args.delegateTrx * 1e6),
    args.receiverAddress,
    args.resource,
    args.treasuryAddress
  );
  const txid = await signAndSend({ tronWeb, tx, privateKey: args.treasuryPrivateKey });
  await sleep(3_000);
  return txid;
}
