import { InlineKeyboard, Keyboard } from "grammy";
import type { Plan } from "../../db/types.js";

export function mainKeyboard(): Keyboard {
  return new Keyboard()
    .text("🔍 Проверить кошелёк")
    .row()
    .text("💳 Тарифы")
    .text("❓ Как это работает")
    .resized();
}

export function plansInlineKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🟢 Lite — 3 USDT", "plan:LITE")
    .row()
    .text("🟡 Pro — 25 USDT", "plan:PRO")
    .row()
    .text("🔴 Max — 79 USDT", "plan:MAX");
}

export function paymentInlineKeyboard(orderId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("🔄 Проверить оплату", `paycheck:${orderId}`)
    .row()
    .text("⬅️ Назад", "payback");
}

export function reportInlineKeyboard(orderId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("📌 Показать HIGH", `showhigh:${orderId}`)
    .row()
    .text("🔗 Revoke links", `revokelinks:${orderId}`)
    .row()
    .text("📄 Скачать CSV", `downloadcsv:${orderId}`);
}

export function formatPlanPrice(plan: Plan): string {
  if (plan === "LITE") return "3.00";
  if (plan === "PRO") return "25.00";
  return "79.00";
}


