import { config } from "./config.js";
import { logger } from "./logger.js";
import { getTelegramBot } from "../bot/telegramApi.js";

export async function notifyAdmin(text: string): Promise<void> {
  const adminIdRaw = config.adminTelegramId;
  if (!adminIdRaw) return;
  const adminId = Number(adminIdRaw);
  if (!adminId) return;

  try {
    const bot = getTelegramBot();
    await bot.api.sendMessage(adminId, `[ADMIN ALERT]\n${text}`.slice(0, 4000));
  } catch (e) {
    logger.error("Failed to notify admin", e);
  }
}


