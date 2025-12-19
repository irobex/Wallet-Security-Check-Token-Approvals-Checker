import type { Context } from "grammy";
import { isEthAddress } from "../../core/validation.js";
import { TEXTS } from "../ui/texts.js";
import { plansInlineKeyboard } from "../ui/keyboards.js";
import type { UserSession } from "../state.js";
import { buildApprovalsReport } from "../../reports/engine.js";

export async function handleWalletInput(ctx: Context, session: UserSession) {
  const text = ctx.message && "text" in ctx.message ? ctx.message.text.trim() : "";
  if (!isEthAddress(text)) {
    await ctx.reply(TEXTS.invalidWallet);
    return;
  }

  session.mode = "IDLE";
  session.walletAddress = text;

  const msg = await ctx.reply(`Адрес: ${text}\n\nСканирую approvals… (это может занять немного времени)`);

  try {
    // Free preview: intentionally keep smaller limits for speed.
    const report = await buildApprovalsReport({
      owner: text,
      chainId: 1,
      maxTokenContracts: 80,
      maxPairs: 400
    });

    const byToken = new Map<string, number>();
    for (const a of report.approvals) {
      const key = a.token_symbol ?? a.token_address;
      byToken.set(key, (byToken.get(key) ?? 0) + 1);
    }
    const topTokens = Array.from(byToken.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `${k} (${v})`)
      .join(", ");

    const preview =
      `Адрес: ${text}\n\n` +
      `RISK: ${report.aggregates.overall_risk}\n` +
      `Active approvals: ${report.aggregates.total_approvals}\n` +
      `Unlimited approvals: ${report.aggregates.unlimited_approvals}\n` +
      `Top tokens: ${topTokens || "—"}\n\n` +
      "Выберите тариф для полного отчёта:";

    await ctx.api.editMessageText(ctx.chat!.id, msg.message_id, preview, {
      reply_markup: plansInlineKeyboard()
    });
  } catch (e) {
    await ctx.api.editMessageText(
      ctx.chat!.id,
      msg.message_id,
      `Адрес: ${text}\n\n` +
        "Не удалось сделать free preview прямо сейчас (RPC/лимиты провайдера).\n" +
        "Вы всё равно можете выбрать тариф — полный отчёт попробуем сделать в воркере.\n\n" +
        "Выберите тариф:",
      { reply_markup: plansInlineKeyboard() }
    );
  }
}


