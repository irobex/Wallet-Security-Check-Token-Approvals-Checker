import type { Plan } from "../db/types.js";

export type PlanCapabilities = {
  plan: Plan;
  urgentLimit: number;
  approvalsLimit: number | null; // null = no explicit limit (still subject to engine caps)
  includeHtml: boolean;
  includePdf: boolean;
};

export function getPlanCapabilities(plan: Plan): PlanCapabilities {
  if (plan === "LITE") {
    return { plan, urgentLimit: 5, approvalsLimit: 30, includeHtml: false, includePdf: false };
  }
  if (plan === "PRO") {
    return { plan, urgentLimit: 10, approvalsLimit: 500, includeHtml: true, includePdf: false };
  }
  return { plan, urgentLimit: 10, approvalsLimit: 2000, includeHtml: true, includePdf: true };
}


