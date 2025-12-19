import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";
import { logger } from "../core/logger.js";
import { config } from "../core/config.js";

async function run() {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required to run migrations.");
  }

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  // Ensure migrations table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT now()
    );
  `);

  const migrationsDir = join(__dirname, "migrations");
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  for (const filename of files) {
    const already = await pool.query<{ filename: string }>(
      "SELECT filename FROM schema_migrations WHERE filename = $1",
      [filename]
    );
    if (already.rows[0]) continue;

    const migrationPath = join(migrationsDir, filename);
    const sql = await readFile(migrationPath, "utf8");

    logger.info(`Running migration ${filename}...`);
    await pool.query("BEGIN");
    try {
      await pool.query(sql);
      await pool.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
      await pool.query("COMMIT");
    } catch (e) {
      await pool.query("ROLLBACK");
      throw e;
    }
    logger.info(`Migration OK: ${filename}`);
  }
}

await run()
  .catch((e) => {
    logger.error("Migration failed", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });


