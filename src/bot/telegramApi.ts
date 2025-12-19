import { Bot } from "grammy";
import { config } from "../core/config.js";

export function getTelegramBot(): Bot {
  const token = config.botToken;
  if (!token) throw new Error("BOT_TOKEN is required for Telegram API.");
  return new Bot(token);
}


