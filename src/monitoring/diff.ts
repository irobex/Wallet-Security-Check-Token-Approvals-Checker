import type { ApprovalsReport } from "../reports/types.js";

type Snapshot = {
  version: 1;
  created_at: string;
  items: Array<{
    token: string;
    spender: string;
    is_unlimited: boolean;
    risk_level: string;
  }>;
};

export function buildSnapshot(report: ApprovalsReport): Snapshot {
  return {
    version: 1,
    created_at: new Date().toISOString(),
    items: report.approvals.map((a) => ({
      token: a.token_address.toLowerCase(),
      spender: a.spender_address.toLowerCase(),
      is_unlimited: a.is_unlimited,
      risk_level: a.risk_level
    }))
  };
}

export function diffSnapshot(prev: Snapshot | null, next: Snapshot): {
  newSpenders: Array<{ token: string; spender: string }>;
  newUnlimited: Array<{ token: string; spender: string }>;
} {
  if (!prev) {
    return { newSpenders: [], newUnlimited: [] };
  }

  const prevSet = new Set(prev.items.map((i) => `${i.token}|${i.spender}`));
  const prevUnlimited = new Set(
    prev.items.filter((i) => i.is_unlimited).map((i) => `${i.token}|${i.spender}`)
  );

  const newSpenders: Array<{ token: string; spender: string }> = [];
  const newUnlimited: Array<{ token: string; spender: string }> = [];

  for (const i of next.items) {
    const k = `${i.token}|${i.spender}`;
    if (!prevSet.has(k)) newSpenders.push({ token: i.token, spender: i.spender });
    if (i.is_unlimited && !prevUnlimited.has(k)) newUnlimited.push({ token: i.token, spender: i.spender });
  }

  return { newSpenders, newUnlimited };
}


