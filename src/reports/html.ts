import ejs from "ejs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ApprovalsReport, ApprovalLine } from "./types.js";

export async function renderHtmlReport(args: {
  report: ApprovalsReport;
  urgentLimit: number;
}): Promise<string> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const templatePath = join(__dirname, "templates", "report.ejs");
  const template = await readFile(templatePath, "utf8");

  const urgent: ApprovalLine[] = args.report.approvals
    .filter((a) => a.risk_level === "HIGH")
    .slice(0, args.urgentLimit);

  return ejs.render(template, { report: args.report, urgent }, { async: false });
}


