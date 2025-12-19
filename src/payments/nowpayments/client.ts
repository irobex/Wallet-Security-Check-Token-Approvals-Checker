import { logger } from "../../core/logger.js";

export type NowPaymentsCreatePaymentRequest = {
  price_amount: string; // e.g. "3.00"
  price_currency: string; // e.g. "usd"
  pay_currency: string; // e.g. "usdttrc20"
  order_id: string; // our internal order UUID
  order_description?: string;
  ipn_callback_url?: string;
  success_url?: string;
  cancel_url?: string;
};

export type NowPaymentsCreatePaymentResponse = {
  payment_id: string | number;
  payment_status?: string;
  pay_address?: string;
  pay_amount?: string | number;
  pay_currency?: string;
  price_amount?: string | number;
  price_currency?: string;
  invoice_url?: string;
};

export type NowPaymentsPaymentStatusResponse = {
  payment_id: string | number;
  payment_status?: string;
  pay_address?: string;
  pay_amount?: string | number;
  actually_paid?: string | number;
  pay_currency?: string;
  outcome_amount?: string | number;
  outcome_currency?: string;
  purchase_id?: string;
  txid?: string;
};

function toStr(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return undefined;
}

export class NowPaymentsClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(args: { apiKey: string; baseUrl?: string }) {
    this.apiKey = args.apiKey;
    this.baseUrl = args.baseUrl ?? "https://api.nowpayments.io";
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const resp = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        ...(init.headers ?? {})
      }
    });

    const text = await resp.text();
    if (!resp.ok) {
      logger.warn(`NOWPayments API error ${resp.status} ${resp.statusText}: ${text.slice(0, 2000)}`);
      // Include provider error details to reduce repeated paid tests.
      let details = text.slice(0, 500);
      try {
        const j = JSON.parse(text) as any;
        const code = typeof j?.code === "string" ? j.code : undefined;
        const msg = typeof j?.message === "string" ? j.message : undefined;
        details = `${code ?? "ERROR"}: ${msg ?? text}`.slice(0, 500);
      } catch {
        // keep raw text snippet
      }
      throw new Error(`NOWPayments API error: HTTP ${resp.status} (${details})`);
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`NOWPayments API returned non-JSON: ${text.slice(0, 2000)}`);
    }
  }

  async createPayment(req: NowPaymentsCreatePaymentRequest): Promise<{
    providerPaymentId: string;
    paymentStatus: string | null;
    payAddress: string;
    payAmount: string;
    payCurrency: string;
    invoiceUrl: string | null;
  }> {
    const res = await this.request<NowPaymentsCreatePaymentResponse>("/v1/payment", {
      method: "POST",
      body: JSON.stringify(req)
    });

    const providerPaymentId = toStr(res.payment_id);
    const payAddress = toStr(res.pay_address);
    const payAmount = toStr(res.pay_amount);
    const payCurrency = toStr(res.pay_currency) ?? req.pay_currency;

    if (!providerPaymentId) throw new Error("NOWPayments: missing payment_id");
    if (!payAddress) throw new Error("NOWPayments: missing pay_address");
    if (!payAmount) throw new Error("NOWPayments: missing pay_amount");

    return {
      providerPaymentId,
      paymentStatus: toStr(res.payment_status) ?? null,
      payAddress,
      payAmount,
      payCurrency,
      invoiceUrl: toStr(res.invoice_url) ?? null
    };
  }

  async getPaymentStatus(paymentId: string): Promise<{
    paymentStatus: string | null;
    actuallyPaid: string | null;
    payAmount: string | null;
    payCurrency: string | null;
    txid: string | null;
  }> {
    const res = await this.request<NowPaymentsPaymentStatusResponse>(`/v1/payment/${encodeURIComponent(paymentId)}`, {
      method: "GET"
    });

    return {
      paymentStatus: toStr(res.payment_status) ?? null,
      actuallyPaid: toStr(res.actually_paid) ?? null,
      payAmount: toStr(res.pay_amount) ?? null,
      payCurrency: toStr(res.pay_currency) ?? null,
      txid: toStr(res.txid) ?? null
    };
  }
}


