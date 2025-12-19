import { logger } from "../core/logger.js";
import { config } from "../core/config.js";
import { writeFileEnsured } from "../core/fs.js";
import { ordersRepo, reportsRepo } from "../db/index.js";
import { pool } from "../db/pool.js";
import { getTelegramBot } from "../bot/telegramApi.js";
import { buildApprovalsReport, buildTelegramSummary } from "../reports/engine.js";
import { generateCsv } from "../reports/csv.js";
import { getPlanCapabilities } from "../reports/plan.js";
import { renderHtmlReport } from "../reports/html.js";
import { renderPdfFromHtml } from "../reports/pdf.js";
import { InputFile } from "grammy";
import { reportInlineKeyboard } from "../bot/ui/keyboards.js";
import { monitoringRepo } from "../db/index.js";
import { notifyAdmin } from "../core/adminAlerts.js";

logger.info("reports-worker started");

const bot = getTelegramBot();

function reportDir(orderId: string): string {
  // Store by order id (safe)
  return `${config.reportsStoragePath}/orders/${orderId}`;
}

async function deliverReportToTelegram(args: {
  telegramId: number;
  summary: string;
  orderId: string;
  csvPath: string;
  htmlPath?: string;
  pdfPath?: string;
}) {
  await bot.api.sendMessage(args.telegramId, args.summary, {
    reply_markup: reportInlineKeyboard(args.orderId)
  });
  await bot.api.sendDocument(args.telegramId, new InputFile(args.csvPath, "report.csv"));
  if (args.htmlPath) {
    await bot.api.sendDocument(args.telegramId, new InputFile(args.htmlPath, "report.html"));
  }
  if (args.pdfPath) {
    await bot.api.sendDocument(args.telegramId, new InputFile(args.pdfPath, "report.pdf"));
  }
}

let running = false;

async function tick() {
  if (running) return;
  running = true;
  let currentOrderId: string | null = null;
  try {
    const order = await ordersRepo.claimNextPaidOrderForReporting();
    if (!order) return;
    currentOrderId = order.id;

    logger.info(`reports-worker: claimed order ${order.id} for reporting`);

    const planCaps = getPlanCapabilities(order.plan);

    // Build the full report (MVP: mainnet only)
    const report = await buildApprovalsReport({
      owner: order.wallet_address,
      chainId: 1
    });

    // Apply plan limit to approvals list (Lite / Pro)
    const approvals = planCaps.approvalsLimit ? report.approvals.slice(0, planCaps.approvalsLimit) : report.approvals;
    const finalReport = { ...report, approvals };

    const summary = buildTelegramSummary(finalReport, planCaps.urgentLimit);

    const dir = reportDir(order.id);
    const csvPath = `${dir}/report.csv`;
    const htmlPath = planCaps.includeHtml ? `${dir}/report.html` : undefined;
    const pdfPath = planCaps.includePdf ? `${dir}/report.pdf` : undefined;

    // CSV
    await writeFileEnsured(csvPath, generateCsv(finalReport));

    // HTML/PDF
    let html: string | undefined;
    if (planCaps.includeHtml || planCaps.includePdf) {
      html = await renderHtmlReport({ report: finalReport, urgentLimit: planCaps.urgentLimit });
      if (planCaps.includeHtml && htmlPath) await writeFileEnsured(htmlPath, html);
      if (planCaps.includePdf && pdfPath) {
        const pdf = await renderPdfFromHtml(html);
        await writeFileEnsured(pdfPath, pdf);
      }
    }

    // Save to DB report
    await reportsRepo.createReport({
      orderId: order.id,
      riskLevel: finalReport.aggregates.overall_risk,
      summaryText: summary,
      dataJson: finalReport,
      csvPath,
      htmlPath,
      pdfPath
    });

    // Deliver to user
    // NOTE: user.telegram_id is stored in users table, but we need to lookup it.
    // Minimal approach: telegram_id is unique; we have order.user_id.
    const q = await pool.query<{ telegram_id: string }>("SELECT telegram_id FROM users WHERE id = $1 LIMIT 1", [
      order.user_id
    ]);
    const telegramId = Number(q.rows[0]?.telegram_id);
    if (!telegramId) throw new Error(`Cannot resolve telegram_id for user_id=${order.user_id}`);

    await deliverReportToTelegram({ telegramId, summary, orderId: order.id, csvPath, htmlPath, pdfPath });

    await ordersRepo.markOrderDelivered(order.id);
    logger.info(`reports-worker: delivered order ${order.id}`);

    // Max plan: create monitoring subscription (30 days)
    if (order.plan === "MAX") {
      const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
      await monitoringRepo.createSubscription({
        userId: order.user_id,
        walletAddress: order.wallet_address,
        expiresAt,
        lastSnapshotJson: { created_from_order_id: order.id }
      });
      logger.info(`reports-worker: monitoring subscription created for order ${order.id}`);
    }
  } catch (e) {
    logger.error("reports-worker tick failed", e);
    await notifyAdmin(`reports-worker tick failed: ${(e as Error)?.message ?? String(e)}`);
    if (currentOrderId) {
      await ordersRepo.markOrderFailed(currentOrderId).catch(() => undefined);
    }
  } finally {
    running = false;
  }
}

setInterval(() => void tick(), 15_000);
await tick().catch((e) => logger.error("reports-worker initial tick failed", e));

process.on("SIGINT", async () => {
  logger.info("reports-worker stopping...");
  await pool.end().catch(() => undefined);
  process.exit(0);
});


