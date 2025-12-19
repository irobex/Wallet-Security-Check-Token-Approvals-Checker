import { pool } from "../pool.js";
import type { UserRow } from "../types.js";

export async function getOrCreateUserByTelegramId(telegramId: number): Promise<UserRow> {
  const existing = await pool.query<UserRow>(
    "SELECT * FROM users WHERE telegram_id = $1 LIMIT 1",
    [telegramId]
  );
  if (existing.rows[0]) return existing.rows[0];

  const created = await pool.query<UserRow>(
    "INSERT INTO users (telegram_id) VALUES ($1) RETURNING *",
    [telegramId]
  );
  return created.rows[0]!;
}


