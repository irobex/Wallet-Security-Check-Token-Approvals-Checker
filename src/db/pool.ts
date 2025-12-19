import pg from "pg";
import { config } from "../core/config.js";

const { Pool } = pg;

if (!config.databaseUrl) {
  throw new Error("DATABASE_URL is required for database connection.");
}

export const pool = new Pool({
  connectionString: config.databaseUrl
});


