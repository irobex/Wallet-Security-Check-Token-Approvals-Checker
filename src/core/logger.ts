/* eslint-disable no-console */

export type LogLevel = "debug" | "info" | "warn" | "error";

function ts(): string {
  return new Date().toISOString();
}

export const logger = {
  debug: (msg: string, meta?: unknown) => console.debug(`[${ts()}] [DEBUG] ${msg}`, meta ?? ""),
  info: (msg: string, meta?: unknown) => console.info(`[${ts()}] [INFO] ${msg}`, meta ?? ""),
  warn: (msg: string, meta?: unknown) => console.warn(`[${ts()}] [WARN] ${msg}`, meta ?? ""),
  error: (msg: string, meta?: unknown) => console.error(`[${ts()}] [ERROR] ${msg}`, meta ?? "")
};


