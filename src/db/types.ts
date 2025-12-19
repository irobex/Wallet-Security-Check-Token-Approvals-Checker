export type Plan = "LITE" | "PRO" | "MAX";
export type OrderStatus =
  | "CREATED"
  | "PENDING_PAYMENT"
  | "PAID"
  | "REPORTING"
  | "DELIVERED"
  | "EXPIRED"
  | "FAILED";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type UserRow = {
  id: string;
  telegram_id: string; // bigint comes as string in pg
  created_at: Date;
};

export type OrderRow = {
  id: string;
  user_id: string;
  wallet_address: string;
  plan: Plan;
  price_usdt: string;
  status: OrderStatus;
  payment_provider: string;
  provider_payment_id: string | null;
  provider_status: string | null;
  pay_address: string | null;
  pay_currency: string | null;
  pay_amount: string | null;
  invoice_url: string | null;
  tx_hash: string | null;
  paid_amount: string | null;
  created_at: Date;
  paid_at: Date | null;
  delivered_at: Date | null;
};

export type ReportRow = {
  id: string;
  order_id: string;
  risk_level: RiskLevel | null;
  summary_text: string;
  csv_path: string | null;
  html_path: string | null;
  pdf_path: string | null;
  data_json: unknown;
  created_at: Date;
};


