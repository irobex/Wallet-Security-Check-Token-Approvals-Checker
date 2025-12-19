import { pool } from "../pool.js";

export type MonitoringSubscriptionRow = {
  id: string;
  user_id: string;
  wallet_address: string;
  active: boolean;
  expires_at: Date;
  last_snapshot_json: unknown | null;
  created_at: Date;
};

export async function createSubscription(args: {
  userId: string;
  walletAddress: string;
  expiresAt: Date;
  lastSnapshotJson?: unknown;
}): Promise<MonitoringSubscriptionRow> {
  const q = await pool.query<MonitoringSubscriptionRow>(
    `
    INSERT INTO monitoring_subscriptions (user_id, wallet_address, expires_at, last_snapshot_json)
    VALUES ($1,$2,$3,$4)
    RETURNING *
    `,
    [args.userId, args.walletAddress, args.expiresAt, args.lastSnapshotJson ?? null]
  );
  return q.rows[0]!;
}

export async function getActiveSubscriptions(limit = 200): Promise<MonitoringSubscriptionRow[]> {
  const q = await pool.query<MonitoringSubscriptionRow>(
    `
    SELECT * FROM monitoring_subscriptions
    WHERE active = true AND expires_at > now()
    ORDER BY created_at ASC
    LIMIT $1
    `,
    [limit]
  );
  return q.rows;
}

export async function deactivateExpiredSubscriptions(): Promise<number> {
  const q = await pool.query<{ count: string }>(
    `
    WITH updated AS (
      UPDATE monitoring_subscriptions
      SET active = false
      WHERE active = true AND expires_at <= now()
      RETURNING 1
    )
    SELECT count(*)::text AS count FROM updated
    `
  );
  return Number(q.rows[0]?.count ?? 0);
}

export async function updateSnapshot(args: { subscriptionId: string; snapshot: unknown }): Promise<void> {
  await pool.query(
    "UPDATE monitoring_subscriptions SET last_snapshot_json = $2 WHERE id = $1",
    [args.subscriptionId, args.snapshot]
  );
}


