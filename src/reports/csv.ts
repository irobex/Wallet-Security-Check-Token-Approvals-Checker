import type { ApprovalLine, ApprovalsReport } from "./types.js";

function csvEscape(v: string): string {
  if (v.includes('"') || v.includes(",") || v.includes("\n") || v.includes("\r")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function lineToRow(a: ApprovalLine): string[] {
  return [
    String(a.chainId),
    a.token_address,
    a.token_symbol ?? "",
    a.token_decimals === null ? "" : String(a.token_decimals),
    a.spender_address,
    a.spender_type,
    a.allowance_raw,
    a.allowance_human,
    a.is_unlimited ? "true" : "false",
    a.risk_level,
    a.action,
    a.reason_codes.join(";"),
    a.revoke_link
  ];
}

export function generateCsv(report: ApprovalsReport): string {
  const header = [
    "chain",
    "token_address",
    "token_symbol",
    "token_decimals",
    "spender_address",
    "spender_type",
    "allowance_raw",
    "allowance_human",
    "is_unlimited",
    "risk_level",
    "action",
    "reason_codes",
    "revoke_link"
  ];

  const rows = [header, ...report.approvals.map(lineToRow)];
  return rows.map((r) => r.map((v) => csvEscape(v)).join(",")).join("\n") + "\n";
}


