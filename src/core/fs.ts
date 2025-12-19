import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function writeFileEnsured(path: string, data: string | Uint8Array): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, data);
}


