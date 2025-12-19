import type { Context } from "grammy";
import { isEthAddress, isZeroEthAddress } from "../../core/validation.js";
import { TEXTS } from "../ui/texts.js";
import { plansInlineKeyboard } from "../ui/keyboards.js";
import type { UserSession } from "../state.js";
import { buildApprovalsReport } from "../../reports/engine.js";
import { getEthProvider } from "../../eth/provider.js";
import { logger } from "../../core/logger.js";

export async function handleWalletInput(ctx: Context, session: UserSession) {
  const rawText =
    ctx.message && "text" in ctx.message && typeof ctx.message.text === "string" ? ctx.message.text : undefined;
  const text = rawText?.trim() ?? "";
  if (!isEthAddress(text)) {
    await ctx.reply(TEXTS.invalidWallet);
    return;
  }
  if (isZeroEthAddress(text)) {
    await ctx.reply(TEXTS.zeroWallet);
    return;
  }

  session.mode = "IDLE";
  session.walletAddress = text;

  const msg = await ctx.reply(`Адрес: ${text}\n\nСканирую approvals… (это может занять немного времени)`);

  try {
    // Free preview: try "recent blocks" first to avoid RPC limits (Infura often rejects large eth_getLogs).
    const provider = getEthProvider();
    const latest = await provider.getBlockNumber();
    const ranges = [20_000, 5_000, 1_000];

    let report:
      | Awaited<ReturnType<typeof buildApprovalsReport>>
      | null = null;
    let usedRange: number | null = null;
    for (const r of ranges) {
      const fromBlock = Math.max(0, latest - r);
      try {
        report = await buildApprovalsReport({
          owner: text,
          chainId: 1,
          maxTokenContracts: 80,
          maxPairs: 400,
          fromBlock,
          toBlock: latest
        });
        usedRange = r;
        break;
      } catch (e) {
        logger.warn(
          `free preview failed for ${text} range=${r} blocks (${fromBlock}..${latest}): ${(e as Error)?.message ?? String(e)}`
        );
        // Backoff a bit to avoid immediate rate-limit cascades on Infura
        await new Promise((res) => setTimeout(res, 800));
      }
    }

    if (!report || !usedRange) throw new Error("free preview failed for all scan ranges");

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

    const scanNote =
      usedRange < 200_000
        ? `Free preview scan: последние ~${usedRange.toLocaleString("ru-RU")} блоков (из-за лимитов RPC)\n\n`
        : "";

    const preview =
      `Адрес: ${text}\n\n` +
      scanNote +
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


