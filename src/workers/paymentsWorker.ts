import { logger } from "../core/logger.js";
import { ordersRepo, pool } from "../db/index.js";
import { findIncomingUsdtPayment } from "../payments/tron/monitor.js";
import { notifyAdmin } from "../core/adminAlerts.js";
import { config } from "../core/config.js";
import { usdtToMicro } from "../payments/tron/usdt_trc20.js";
import { deriveTronAddressFromMnemonic, deriveTronPrivateKeyHexFromMnemonic } from "../payments/tron/hd.js";
import { sweepUsdtToTreasury } from "../payments/tron/sweep.js";

logger.info("payments-worker started");

let running = false;
const loggedOrders = new Set<string>();

async function tick() {
  if (running) return;
  running = true;
  try {
    const expired = await ordersRepo.expireOldUnpaidOrders({ olderThanMinutes: 60 });
    if (expired > 0) logger.info(`payments-worker: expired ${expired} order(s)`);

    const orders = await ordersRepo.getOrdersByStatuses(["PENDING_PAYMENT", "EXPIRED"], 200);
    if (orders.length) logger.info(`payments-worker: checking ${orders.length} order(s)`);

    for (const order of orders) {
      if (order.tx_hash) continue;

      try {
        if (!loggedOrders.has(order.id)) {
          loggedOrders.add(order.id);
          const ageMin = (Date.now() - new Date(order.created_at).getTime()) / 60000;
          logger.info(
            `payments-worker: watching order=${order.id} status=${order.status} expected=${order.price_usdt} addr=${order.pay_address} ageMin=${ageMin.toFixed(1)}`
          );
        }

        const match = await findIncomingUsdtPayment({
          payAddress: order.pay_address,
          expectedAmountUsdt: order.price_usdt
        });
        if (!match) continue;

        await ordersRepo.markOrderPaid({
          orderId: order.id,
          txHash: match.txHash,
          paidAmount: match.paidAmountUsdt
        });

        logger.info(`Order PAID: ${order.id} tx=${match.txHash} amount=${match.paidAmountUsdt}`);

        // Optional: auto-sweep USDT to treasury address so owner doesn't need to manually fund each address with TRX.
        if (config.tronSweepEnabled) {
          if (!config.tronMnemonic || !config.trongridApiKey) {
            throw new Error("TRON_SWEEP_ENABLED but TRON_MNEMONIC/TRONGRID_API_KEY missing");
          }
          if (!config.tronSweepToAddress) {
            throw new Error("TRON_SWEEP_ENABLED but TRON_SWEEP_TO_ADDRESS missing");
          }

          const treasuryIndex = Number.isFinite(config.tronTreasuryHdIndex) ? config.tronTreasuryHdIndex : 0;
          const treasuryAddress = deriveTronAddressFromMnemonic(config.tronMnemonic, treasuryIndex);
          const treasuryPriv = deriveTronPrivateKeyHexFromMnemonic(config.tronMnemonic, treasuryIndex);
          const payPriv = deriveTronPrivateKeyHexFromMnemonic(config.tronMnemonic, order.hd_index);
          const amountMicro = usdtToMicro(match.paidAmountUsdt);

          logger.info(
            `sweep: order=${order.id} pay=${order.pay_address} -> ${config.tronSweepToAddress} amount=${match.paidAmountUsdt} (treasury=${treasuryAddress})`
          );

          const res = await sweepUsdtToTreasury({
            apiKey: config.trongridApiKey,
            treasuryPrivateKey: treasuryPriv,
            treasuryAddress,
            payPrivateKey: payPriv,
            payAddress: order.pay_address,
            sweepToAddress: config.tronSweepToAddress,
            amountMicro,
            topupTrx: config.tronSweepTopupTrx,
            delegation: {
              enabled: config.tronDelegationEnabled,
              freezeTrx: config.tronDelegationFreezeTrx,
              delegateEnergyTrx: config.tronDelegationDelegateEnergyTrx,
              delegateBandwidthTrx: config.tronDelegationDelegateBandwidthTrx,
              undelegateAfter: config.tronDelegationUndelegateAfter,
              minPayTrx: config.tronDelegationMinPayTrx
            }
          });

          logger.info(
            `sweep: done order=${order.id} topupTxs=${res.topupTxs?.join(",") ?? "—"} freezeTx=${res.freezeTx ?? "—"} delegateTxs=${
              res.delegateTxs?.join(",") ?? "—"
            } undelegateTxs=${res.undelegateTxs?.join(",") ?? "—"} sweepTx=${res.sweepTx}`
          );
        }
      } catch (e) {
        logger.error(`payments-worker: failed processing order ${order.id}`, e);
        await notifyAdmin(`payments-worker error for order ${order.id}: ${(e as Error)?.message ?? String(e)}`);
      }
    }
  } finally {
    running = false;
  }
}

setInterval(() => void tick(), 15_000);
await tick().catch((e) => logger.error("payments-worker initial tick failed", e));

// Graceful shutdown
process.on("SIGINT", async () => {
  logger.info("payments-worker stopping...");
  await pool.end().catch(() => undefined);
  process.exit(0);
});
