import type { RiskLevel, Action } from "./scoring.js";

export type SpenderType = "EOA" | "CONTRACT" | "UNKNOWN";

export type ApprovalLine = {
  chainId: number;
  token_address: string;
  token_symbol: string | null;
  token_decimals: number | null;
  spender_address: string;
  spender_type: SpenderType;
  allowance_raw: string;
  allowance_human: string;
  is_unlimited: boolean;
  risk_level: RiskLevel;
  action: Action;
  reason_codes: string[];
  human_reason: string;
  revoke_link: string;
};

export type ApprovalsReport = {
  owner: string;
  chainId: number;
  approvals: ApprovalLine[];
  warnings?: string[];
  aggregates: {
    total_approvals: number;
    unlimited_approvals: number;
    high_count: number;
    medium_count: number;
    low_count: number;
    overall_risk: RiskLevel;
  };
  generated_at: string;
  provider: {
    approvals_events: string;
    rpc: string;
  };
  runtime_ms: number;
};


