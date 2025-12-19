import { pool } from "../pool.js";
import type { OrderRow, OrderStatus, Plan } from "../types.js";

export async function createOrder(args: {
  userId: string;
  walletAddress: string;
  plan: Plan;
  priceUsdt: string; // "9.00"
  status?: OrderStatus;
}): Promise<OrderRow> {
  const status = args.status ?? "CREATED";

  const q = await pool.query<OrderRow>(
    `
    INSERT INTO orders (user_id, wallet_address, plan, price_usdt, status)
    VALUES ($1,$2,$3,$4,$5)
    RETURNING *
    `,
    [args.userId, args.walletAddress, args.plan, args.priceUsdt, status]
  );
  return q.rows[0]!;
}

export async function setOrderPaymentRequest(args: {
  orderId: string;
  provider: string; // "nowpayments"
  providerPaymentId: string;
  providerStatus: string | null;
  payAddress: string;
  payAmount: string;
  payCurrency: string;
  invoiceUrl: string | null;
}): Promise<OrderRow> {
  const q = await pool.query<OrderRow>(
    `
    UPDATE orders
    SET status = 'PENDING_PAYMENT',
        payment_provider = $2,
        provider_payment_id = $3,
        provider_status = $4,
        pay_address = $5,
        pay_amount = $6,
        pay_currency = $7,
        invoice_url = $8
    WHERE id = $1
    RETURNING *
    `,
    [
      args.orderId,
      args.provider,
      args.providerPaymentId,
      args.providerStatus,
      args.payAddress,
      args.payAmount,
      args.payCurrency,
      args.invoiceUrl
    ]
  );
  if (!q.rows[0]) throw new Error("Order not found");
  return q.rows[0];
}

export async function getOrdersByStatus(status: OrderStatus, limit = 100): Promise<OrderRow[]> {
  const q = await pool.query<OrderRow>(
    "SELECT * FROM orders WHERE status = $1 ORDER BY created_at ASC LIMIT $2",
    [status, limit]
  );
  return q.rows;
}

export async function getOrdersByStatuses(statuses: OrderStatus[], limit = 200): Promise<OrderRow[]> {
  const q = await pool.query<OrderRow>(
    "SELECT * FROM orders WHERE status = ANY($1) ORDER BY created_at ASC LIMIT $2",
    [statuses, limit]
  );
  return q.rows;
}

export async function markOrderPaid(args: {
  orderId: string;
  providerPaymentId: string;
  providerStatus: string | null;
  txHash: string | null;
  paidAmount: string; // e.g. "3.000000"
}): Promise<OrderRow> {
  // Prevent a single provider payment id from being assigned to multiple orders.
  const existing = await pool.query<{ id: string }>(
    "SELECT id FROM orders WHERE provider_payment_id = $1 LIMIT 1",
    [args.providerPaymentId]
  );
  if (existing.rows[0] && existing.rows[0].id !== args.orderId) {
    throw new Error(`provider_payment_id already used by another order: ${args.providerPaymentId}`);
  }

  const q = await pool.query<OrderRow>(
    `
    UPDATE orders
    SET status = 'PAID',
        provider_payment_id = $2,
        provider_status = $3,
        tx_hash = COALESCE($4, tx_hash),
        paid_amount = $5,
        paid_at = now()
    WHERE id = $1 AND (provider_payment_id IS NULL OR provider_payment_id = $2)
    RETURNING *
    `,
    [args.orderId, args.providerPaymentId, args.providerStatus, args.txHash, args.paidAmount]
  );
  if (!q.rows[0]) throw new Error("Order not found or already paid with different provider_payment_id");
  return q.rows[0];
}

export async function getOrderById(orderId: string): Promise<OrderRow | null> {
  const q = await pool.query<OrderRow>("SELECT * FROM orders WHERE id = $1 LIMIT 1", [orderId]);
  return q.rows[0] ?? null;
}

/**
 * Atomically claims one PAID order for reporting by switching it to REPORTING.
 * Returns the claimed order or null.
 */
export async function claimNextPaidOrderForReporting(): Promise<OrderRow | null> {
  const q = await pool.query<OrderRow>(
    `
    WITH claimed AS (
      SELECT id FROM orders
      WHERE status = 'PAID'
      ORDER BY paid_at ASC NULLS LAST, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE orders
    SET status = 'REPORTING'
    WHERE id IN (SELECT id FROM claimed)
    RETURNING *
    `
  );
  return q.rows[0] ?? null;
}

export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<OrderRow> {
  const q = await pool.query<OrderRow>("UPDATE orders SET status = $2 WHERE id = $1 RETURNING *", [
    orderId,
    status
  ]);
  return q.rows[0]!;
}

export async function markOrderDelivered(orderId: string): Promise<OrderRow> {
  const q = await pool.query<OrderRow>(
    "UPDATE orders SET status = 'DELIVERED', delivered_at = now() WHERE id = $1 RETURNING *",
    [orderId]
  );
  return q.rows[0]!;
}

export async function markOrderFailed(orderId: string): Promise<OrderRow> {
  const q = await pool.query<OrderRow>("UPDATE orders SET status = 'FAILED' WHERE id = $1 RETURNING *", [orderId]);
  return q.rows[0]!;
}

/**
 * Marks old unpaid orders as EXPIRED.
 * We expire only orders that are not paid yet.
 */
export async function expireOldUnpaidOrders(args: { olderThanMinutes: number }): Promise<number> {
  const q = await pool.query<{ count: string }>(
    `
    WITH updated AS (
      UPDATE orders
      SET status = 'EXPIRED'
      WHERE status IN ('CREATED','PENDING_PAYMENT')
        AND created_at < (now() - ($1::int * interval '1 minute'))
      RETURNING 1
    )
    SELECT count(*)::text AS count FROM updated
    `,
    [args.olderThanMinutes]
  );
  return Number(q.rows[0]?.count ?? 0);
}


