import type { Context } from "grammy";

export async function handlePlans(ctx: Context) {
  await ctx.reply(
    "Тарифы:\n\n" +
      "🟢 Lite — 9 USDT\n" +
      "- обзор approvals в Ethereum\n" +
      "- ограниченный список\n" +
      "- CSV\n\n" +
      "🟡 Pro — 25 USDT (рекомендуем)\n" +
      "- полный список approvals (в разумных пределах)\n" +
      "- risk scoring + REVOKE NOW / REVIEW / OK\n" +
      "- HTML + CSV\n\n" +
      "🔴 Max — 79 USDT\n" +
      "- всё из Pro\n" +
      "- PDF + CSV\n" +
      "- мониторинг 30 дней (best-effort)"
  );
}


