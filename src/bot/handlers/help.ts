import type { Context } from "grammy";

export async function handleHelp(ctx: Context) {
  await ctx.reply(
    "Как это работает:\n\n" +
      "- вы отправляете публичный адрес 0x…\n" +
      "- мы анализируем approvals (allowances) в Ethereum\n" +
      "- показываем риски и что лучше отозвать\n\n" +
      "Это read-only анализ: без подключений кошелька и без подписей."
  );
}


