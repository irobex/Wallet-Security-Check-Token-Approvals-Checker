import { Bot } from "grammy";
import { config } from "../core/config.js";
import { logger } from "../core/logger.js";
import { handleStart } from "./handlers/start.js";
import { handleHelp } from "./handlers/help.js";
import { handlePlans } from "./handlers/plans.js";
import { handleWalletInput } from "./handlers/checkWallet.js";
import { TEXTS } from "./ui/texts.js";
import type { UserSession } from "./state.js";
import type { Plan } from "../db/types.js";
import { formatPlanPrice, paymentInlineKeyboard } from "./ui/keyboards.js";
import { usersRepo, ordersRepo, reportsRepo } from "../db/index.js";
import { getOrderById } from "../db/repos/ordersRepo.js";
import type { ApprovalsReport } from "../reports/types.js";
import { InputFile } from "grammy";
import { notifyAdmin } from "../core/adminAlerts.js";
import { NowPaymentsClient } from "../payments/nowpayments/client.js";

const token = config.botToken;
if (!token) {
  throw new Error("BOT_TOKEN is required. Create .env and set BOT_TOKEN=...");
}

const bot = new Bot(token);

const sessions = new Map<number, UserSession>();
function getSession(chatId: number): UserSession {
  const s = sessions.get(chatId) ?? { mode: "IDLE" };
  sessions.set(chatId, s);
  return s;
}

bot.command("start", handleStart);
bot.hears("❓ Как это работает", handleHelp);
bot.hears("💳 Тарифы", handlePlans);
bot.hears("🔍 Проверить кошелёк", async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const session = getSession(chatId);
  session.mode = "WAITING_WALLET";
  await ctx.reply(TEXTS.askWallet);
});

bot.callbackQuery(/^plan:(LITE|PRO|MAX)$/, async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const plan = ctx.match[1] as Plan;
  const session = getSession(chatId);
  const walletAddress = session.walletAddress;
  if (!walletAddress) {
    await ctx.answerCallbackQuery();
    await ctx.reply("Сначала пришлите Ethereum-адрес через «🔍 Проверить кошелёк».");
    return;
  }

  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  if (!config.nowpaymentsApiKey) {
    await ctx.answerCallbackQuery();
    await ctx.reply("Ошибка конфигурации: NOWPAYMENTS_API_KEY не задан. Админ: проверьте .env.");
    return;
  }

  await ctx.answerCallbackQuery();

  const user = await usersRepo.getOrCreateUserByTelegramId(telegramId);
  const price = formatPlanPrice(plan);

  const order = await ordersRepo.createOrder({
    userId: user.id,
    walletAddress,
    plan,
    priceUsdt: price,
    status: "CREATED"
  });
  session.lastOrderId = order.id;

  try {
    const np = new NowPaymentsClient({ apiKey: config.nowpaymentsApiKey, baseUrl: config.nowpaymentsBaseUrl });
    const created = await np.createPayment({
      price_amount: price,
      price_currency: config.nowpaymentsPriceCurrency,
      pay_currency: config.nowpaymentsPayCurrency,
      order_id: order.id,
      order_description: `Wallet Guard ${plan} report`
    });

    const updated = await ordersRepo.setOrderPaymentRequest({
      orderId: order.id,
      provider: "nowpayments",
      providerPaymentId: created.providerPaymentId,
      providerStatus: created.paymentStatus,
      payAddress: created.payAddress,
      payAmount: created.payAmount,
      payCurrency: created.payCurrency,
      invoiceUrl: created.invoiceUrl
    });

    const invoiceLine = updated.invoice_url ? `\nСсылка на инвойс: ${updated.invoice_url}\n` : "";

    await ctx.reply(
      `Оплатите ${updated.pay_currency ?? config.nowpaymentsPayCurrency} на адрес:\n${updated.pay_address}\n\n` +
        `Сумма: ${updated.pay_amount} ${updated.pay_currency ?? config.nowpaymentsPayCurrency}\n\n` +
        "После оплаты отчёт придёт автоматически (обычно до 1–2 минут)." +
        invoiceLine,
      { reply_markup: paymentInlineKeyboard(order.id) }
    );
    return;
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    logger.warn(`NOWPayments createPayment failed for order=${order.id}: ${msg}`);
    void notifyAdmin(`NOWPayments createPayment failed (order=${order.id}): ${msg}`);
  }

  await ctx.reply(
    "Сейчас не удалось создать инвойс у платёжного провайдера. Попробуйте ещё раз через «💳 Тарифы».\n" +
      "Админ получил уведомление.",
    { reply_markup: paymentInlineKeyboard(order.id) }
  );
});

bot.callbackQuery(/^paycheck:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const orderId = ctx.match[1];
  const order = await getOrderById(orderId);
  if (!order) {
    await ctx.reply("Заказ не найден.");
    return;
  }

  const lines = [
    `Статус заказа: ${order.status}`,
    order.provider_status ? `Платёж: ${order.provider_status}` : "Платёж: —",
    order.tx_hash ? `TX: ${order.tx_hash}` : "TX: —",
    order.paid_amount ? `Оплачено: ${order.paid_amount} USDT` : "Оплачено: —"
  ];
  await ctx.reply(lines.join("\n"));
});

bot.callbackQuery("payback", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply("Ок. Нажмите «🔍 Проверить кошелёк», чтобы начать заново.");
});

bot.callbackQuery(/^showhigh:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const orderId = ctx.match[1];
  const rep = await reportsRepo.getReportByOrderId(orderId);
  if (!rep) {
    await ctx.reply("Отчёт ещё не готов.");
    return;
  }

  const data = rep.data_json as ApprovalsReport;
  const highs = (data.approvals ?? []).filter((a) => a.risk_level === "HIGH").slice(0, 20);
  if (!highs.length) {
    await ctx.reply("HIGH items не найдено.");
    return;
  }
  const lines = highs.map((h, i) => {
    const sym = h.token_symbol ?? h.token_address.slice(0, 6) + "…";
    return `${i + 1}) ${sym} -> ${h.spender_address}\n${h.human_reason}\nRevoke: ${h.revoke_link}`;
  });
  await ctx.reply(lines.join("\n\n"));
});

bot.callbackQuery(/^revokelinks:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const orderId = ctx.match[1];
  const rep = await reportsRepo.getReportByOrderId(orderId);
  if (!rep) {
    await ctx.reply("Отчёт ещё не готов.");
    return;
  }
  const data = rep.data_json as ApprovalsReport;
  const items = (data.approvals ?? []).filter((a) => a.risk_level !== "LOW").slice(0, 20);
  if (!items.length) {
    await ctx.reply("Нет ссылок для revoke (всё LOW).");
    return;
  }
  const text = items
    .map((a) => {
      const sym = a.token_symbol ?? a.token_address.slice(0, 6) + "…";
      return `${sym} -> ${a.spender_address}\n${a.revoke_link}`;
    })
    .join("\n\n");
  await ctx.reply(text);
});

bot.callbackQuery(/^downloadcsv:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const orderId = ctx.match[1];
  const rep = await reportsRepo.getReportByOrderId(orderId);
  if (!rep || !rep.csv_path) {
    await ctx.reply("CSV ещё не готов.");
    return;
  }
  await ctx.api.sendDocument(ctx.chat!.id, new InputFile(rep.csv_path, "report.csv"));
});

bot.on("message:text", async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const session = getSession(chatId);
  if (session.mode === "WAITING_WALLET") {
    await handleWalletInput(ctx, session);
    return;
  }
});

bot.catch((err) => {
  logger.error("Bot error", err);
  void notifyAdmin(`bot error: ${(err as Error)?.message ?? String(err)}`);
});

logger.info("Starting bot polling...");
await bot.start();


