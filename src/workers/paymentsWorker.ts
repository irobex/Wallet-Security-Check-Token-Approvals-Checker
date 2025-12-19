import { logger } from "../core/logger.js";
import { ordersRepo, pool } from "../db/index.js";
import { notifyAdmin } from "../core/adminAlerts.js";
import { config } from "../core/config.js";
import { NowPaymentsClient } from "../payments/nowpayments/client.js";

logger.info("payments-worker started");

let running = false;
const loggedOrders = new Set<string>();

function normStatus(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().trim();
}

async function tick() {
  if (running) return;
  running = true;
  try {
    const expired = await ordersRepo.expireOldUnpaidOrders({ olderThanMinutes: 60 });
    if (expired > 0) logger.info(`payments-worker: expired ${expired} order(s)`);

    const orders = await ordersRepo.getOrdersByStatuses(["PENDING_PAYMENT", "EXPIRED"], 200);
    if (orders.length) logger.info(`payments-worker: checking ${orders.length} order(s)`);

    if (!config.nowpaymentsApiKey) {
      if (orders.length) {
        throw new Error("NOWPAYMENTS_API_KEY is missing (payments-worker cannot check payments)");
      }
      return;
    }

    const np = new NowPaymentsClient({ apiKey: config.nowpaymentsApiKey, baseUrl: config.nowpaymentsBaseUrl });

    for (const order of orders) {
      if (order.status === "PAID" || order.status === "REPORTING" || order.status === "DELIVERED") continue;
      if (!order.provider_payment_id) continue;

      try {
        if (!loggedOrders.has(order.id)) {
          loggedOrders.add(order.id);
          const ageMin = (Date.now() - new Date(order.created_at).getTime()) / 60000;
          logger.info(
            `payments-worker: watching order=${order.id} status=${order.status} expected=${order.price_usdt} providerPaymentId=${order.provider_payment_id} ageMin=${ageMin.toFixed(1)}`
          );
        }

        const st = await np.getPaymentStatus(order.provider_payment_id);
        const s = normStatus(st.paymentStatus);
        if (!s) continue;

        // Keep last known provider status for debugging (best-effort).
        // We don't fail the tick if this update isn't supported by the current DB schema yet.
        await pool
          .query("UPDATE orders SET provider_status = $2 WHERE id = $1", [order.id, st.paymentStatus])
          .catch(() => undefined);

        // NOWPayments statuses: waiting/confirming/confirmed/sending/finished/failed/refunded/expired
        const isPaid = s === "finished" || s === "confirmed" || s === "sending";
        if (!isPaid) continue;

        const paidAmount = st.actuallyPaid ?? order.price_usdt;
        await ordersRepo.markOrderPaid({
          orderId: order.id,
          providerPaymentId: order.provider_payment_id,
          providerStatus: st.paymentStatus,
          txHash: st.txid ?? null,
          paidAmount
        });

        logger.info(
          `Order PAID: ${order.id} providerPaymentId=${order.provider_payment_id} status=${st.paymentStatus ?? "—"} paid=${paidAmount} tx=${st.txid ?? "—"}`
        );
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
