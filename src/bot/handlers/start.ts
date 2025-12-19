import type { Context } from "grammy";
import { TEXTS } from "../ui/texts.js";
import { mainKeyboard } from "../ui/keyboards.js";

export async function handleStart(ctx: Context) {
  await ctx.reply(TEXTS.start, { reply_markup: mainKeyboard() });
}


