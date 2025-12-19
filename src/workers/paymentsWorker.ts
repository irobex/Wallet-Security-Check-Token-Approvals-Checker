import { logger } from "../core/logger.js";
import { ordersRepo, pool } from "../db/index.js";
import { findIncomingUsdtPayment } from "../payments/tron/monitor.js";
import { notifyAdmin } from "../core/adminAlerts.js";

logger.info("payments-worker started");

let running = false;

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


