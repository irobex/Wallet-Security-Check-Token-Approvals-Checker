import { pool } from "../pool.js";
import type { ReportRow, RiskLevel } from "../types.js";

export async function createReport(args: {
  orderId: string;
  riskLevel: RiskLevel;
  summaryText: string;
  dataJson: unknown;
  csvPath?: string;
  htmlPath?: string;
  pdfPath?: string;
}): Promise<ReportRow> {
  const q = await pool.query<ReportRow>(
    `
    INSERT INTO reports (order_id, risk_level, summary_text, csv_path, html_path, pdf_path, data_json)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    RETURNING *
    `,
    [
      args.orderId,
      args.riskLevel,
      args.summaryText,
      args.csvPath ?? null,
      args.htmlPath ?? null,
      args.pdfPath ?? null,
      args.dataJson
    ]
  );
  return q.rows[0]!;
}

export async function getReportByOrderId(orderId: string): Promise<ReportRow | null> {
  const q = await pool.query<ReportRow>("SELECT * FROM reports WHERE order_id = $1 LIMIT 1", [orderId]);
  return q.rows[0] ?? null;
}


