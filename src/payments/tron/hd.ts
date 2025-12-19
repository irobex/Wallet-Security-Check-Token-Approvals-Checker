import { HDNodeWallet } from "ethers";
import TronWeb from "tronweb";
import { pool } from "../../db/pool.js";

/**
 * Allocates next TRON HD index atomically from DB.
 * Uses a single-row table tron_hd_state(id=1).
 */
export async function allocateNextTronHdIndex(): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const q = await client.query<{ next_index: number }>(
      "SELECT next_index FROM tron_hd_state WHERE id = 1 FOR UPDATE"
    );
    const next = q.rows[0]?.next_index;
    if (typeof next !== "number") throw new Error("tron_hd_state row missing");

    await client.query("UPDATE tron_hd_state SET next_index = next_index + 1 WHERE id = 1");
    await client.query("COMMIT");
    return next;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

export function tronDerivationPath(index: number): string {
  return `m/44'/195'/0'/0/${index}`;
}

/**
 * Derive TRON payment address from mnemonic + index using standard TRON path.
 * We derive a private key via BIP32 (ethers) and convert to a TRON address via tronweb.
 */
export function deriveTronAddressFromMnemonic(mnemonic: string, index: number): string {
  const path = tronDerivationPath(index);
  const wallet = HDNodeWallet.fromPhrase(mnemonic, undefined, path);
  const priv = wallet.privateKey.startsWith("0x") ? wallet.privateKey.slice(2) : wallet.privateKey;
  return TronWeb.address.fromPrivateKey(priv);
}


