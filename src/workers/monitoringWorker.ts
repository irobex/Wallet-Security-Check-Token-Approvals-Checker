import { logger } from "../core/logger.js";
import { monitoringRepo, pool } from "../db/index.js";
import { getTelegramBot } from "../bot/telegramApi.js";
import { buildApprovalsReport } from "../reports/engine.js";
import { buildSnapshot, diffSnapshot } from "../monitoring/diff.js";
import { notifyAdmin } from "../core/adminAlerts.js";

logger.info("monitoring-worker started");

const bot = getTelegramBot();

let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const deactivated = await monitoringRepo.deactivateExpiredSubscriptions();
    if (deactivated > 0) logger.info(`monitoring-worker: deactivated ${deactivated} expired subscription(s)`);

    const subs = await monitoringRepo.getActiveSubscriptions(200);
    if (!subs.length) return;
    logger.info(`monitoring-worker: checking ${subs.length} subscription(s)`);

    for (const s of subs) {
      try {
        const report = await buildApprovalsReport({ owner: s.wallet_address, chainId: 1 });
        const nextSnap = buildSnapshot(report);
        const prevSnap = (s.last_snapshot_json as any) ?? null;

        const diff = diffSnapshot(prevSnap, nextSnap);

        const newUnlimited = diff.newUnlimited.slice(0, 10);
        const newSpenders = diff.newSpenders.slice(0, 10);

        if (newUnlimited.length || newSpenders.length) {
          // resolve telegram_id
          const q = await pool.query<{ telegram_id: string }>(
            "SELECT telegram_id FROM users WHERE id = $1 LIMIT 1",
            [s.user_id]
          );
          const telegramId = Number(q.rows[0]?.telegram_id);
          if (!telegramId) throw new Error(`Cannot resolve telegram_id for user_id=${s.user_id}`);

          const parts: string[] = [];
          parts.push("Wallet Guard monitoring alert");
          parts.push(`Address: ${s.wallet_address}`);
          parts.push("");
          if (newUnlimited.length) {
            parts.push("New UNLIMITED approvals detected:");
            for (const u of newUnlimited) {
              parts.push(`- token ${u.token} -> spender ${u.spender}`);
            }
            parts.push("");
          }
          if (newSpenders.length) {
            parts.push("New spenders detected:");
            for (const n of newSpenders) {
              parts.push(`- token ${n.token} -> spender ${n.spender}`);
            }
            parts.push("");
          }
          parts.push("Tip: open the bot and generate a fresh report if needed.");

          await bot.api.sendMessage(telegramId, parts.join("\n").slice(0, 4000));
        }

        await monitoringRepo.updateSnapshot({ subscriptionId: s.id, snapshot: nextSnap });
      } catch (e) {
        logger.error(`monitoring-worker: failed subscription ${s.id}`, e);
        await notifyAdmin(
          `monitoring-worker error for subscription ${s.id}: ${(e as Error)?.message ?? String(e)}`
        );
      }
    }
  } finally {
    running = false;
  }
}

// Daily tick (24h) + run immediately on start
setInterval(() => void tick(), 24 * 3600 * 1000);
await tick().catch((e) => {
  logger.error("monitoring-worker initial tick failed", e);
  void notifyAdmin(`monitoring-worker initial tick failed: ${(e as Error)?.message ?? String(e)}`);
});

process.on("SIGINT", async () => {
  logger.info("monitoring-worker stopping...");
  await pool.end().catch(() => undefined);
  process.exit(0);
});


