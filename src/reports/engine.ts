import { config } from "../core/config.js";
import { logger } from "../core/logger.js";
import { asyncPool } from "../core/async.js";
import { getEthProvider } from "../eth/provider.js";
import { getErc20Contract } from "../eth/erc20.js";
import { RpcApprovalEventProvider } from "../eth/approvals/rpcApprovalEventProvider.js";
import type { ApprovalEvent } from "../eth/approvals/types.js";
import { tokenMetadataRepo } from "../db/index.js";
import { formatUnitsSafe } from "./format.js";
import { getSpenderReputation } from "./reputation.js";
import { isUnlimited } from "./unlimited.js";
import { buildRevokeLink } from "./revokeLinks.js";
import { scoreApprovalLine } from "./scoring.js";
import { isMajorToken } from "./majorTokens.js";
import type { ApprovalsReport, ApprovalLine, SpenderType } from "./types.js";

type PairKey = string; // token|spender

function pairKey(token: string, spender: string): PairKey {
  return `${token.toLowerCase()}|${spender.toLowerCase()}`;
}

function daysBetween(nowMs: number, thenMs?: number): number | undefined {
  if (!thenMs) return undefined;
  const d = (nowMs - thenMs) / (24 * 3600 * 1000);
  return d < 0 ? 0 : d;
}

async function getSpenderType(spender: string): Promise<SpenderType> {
  const provider = getEthProvider();
  try {
    const code = await provider.getCode(spender);
    if (!code) return "UNKNOWN";
    return code.length > 2 ? "CONTRACT" : "EOA";
  } catch {
    return "UNKNOWN";
  }
}

async function getTokenMetadata(chainId: number, tokenAddress: string): Promise<{
  symbol: string | null;
  name: string | null;
  decimals: number | null;
}> {
  const cached = await tokenMetadataRepo.getTokenMetadata({ chainId, tokenAddress });
  if (cached && cached.decimals !== null && cached.symbol !== null) {
    return { symbol: cached.symbol, name: cached.name, decimals: cached.decimals };
  }

  const token = getErc20Contract(tokenAddress);

  let symbol: string | null = cached?.symbol ?? null;
  let name: string | null = cached?.name ?? null;
  let decimals: number | null = cached?.decimals ?? null;

  try {
    symbol = await token.symbol();
  } catch {}
  try {
    name = await token.name();
  } catch {}
  try {
    decimals = Number(await token.decimals());
  } catch {}

  await tokenMetadataRepo.upsertTokenMetadata({ chainId, tokenAddress, symbol, name, decimals });
  return { symbol, name, decimals };
}

export async function buildApprovalsReport(args: {
  owner: string;
  chainId?: number;
  maxTokenContracts?: number;
  maxPairs?: number;
}): Promise<ApprovalsReport> {
  const t0 = Date.now();
  const provider = getEthProvider();
  const chainId = args.chainId ?? 1;
  const warnings: string[] = [];

  const latest = await provider.getBlockNumber();
  const maxRange = Number.isFinite(config.ethApprovalsMaxRangeBlocks)
    ? config.ethApprovalsMaxRangeBlocks
    : 0;

  let fromBlock = Number.isFinite(config.ethApprovalsFromBlock) ? config.ethApprovalsFromBlock : 0;
  if (maxRange > 0 && latest - fromBlock > maxRange) {
    const capped = Math.max(0, latest - maxRange);
    logger.warn(
      `Approvals scan range too large (${fromBlock}..${latest}). Capping fromBlock to ${capped} (ETH_APPROVALS_MAX_RANGE_BLOCKS=${maxRange}).`
    );
    warnings.push(
      `Scan range capped: fromBlock adjusted to ${capped} (ETH_APPROVALS_MAX_RANGE_BLOCKS=${maxRange}).`
    );
    fromBlock = capped;
  }

  const approvalsProvider = new RpcApprovalEventProvider();
  const events = await approvalsProvider.getApprovalEvents({ chainId, owner: args.owner, fromBlock, toBlock: latest });

  // Build candidate pairs from events (token, spender)
  const tokenCounts = new Map<string, number>();
  const pairLastTs = new Map<PairKey, number>();
  const pairSet = new Set<PairKey>();

  for (const e of events) {
    const token = e.tokenAddress.toLowerCase();
    tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);

    const key = pairKey(e.tokenAddress, e.spender);
    pairSet.add(key);
    if (e.timestampMs) {
      const prev = pairLastTs.get(key) ?? 0;
      if (e.timestampMs > prev) pairLastTs.set(key, e.timestampMs);
    }
  }

  const maxTokenContracts = args.maxTokenContracts ?? 300;
  const maxPairs = args.maxPairs ?? 2000;

  let selectedPairs = Array.from(pairSet);

  // Safety: reduce scope if huge
  if (tokenCounts.size > maxTokenContracts) {
    warnings.push(
      `Too many token contracts (${tokenCounts.size}). Limited to top ${maxTokenContracts} by Approval frequency.`
    );
    const sortedTokens = Array.from(tokenCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxTokenContracts)
      .map(([t]) => t);
    const tokenAllow = new Set(sortedTokens);
    selectedPairs = selectedPairs.filter((k) => tokenAllow.has(k.split("|")[0]!));
  }
  if (selectedPairs.length > maxPairs) {
    warnings.push(`Too many (token,spender) pairs (${selectedPairs.length}). Limited to ${maxPairs}.`);
    selectedPairs = selectedPairs.slice(0, maxPairs);
  }

  // Snapshot allowances (authoritative): keep only allowance > 0
  const allowanceResults = await asyncPool(10, selectedPairs, async (k) => {
    const [tokenAddress, spender] = k.split("|") as [string, string];
    const token = getErc20Contract(tokenAddress);
    try {
      const allowance = (await token.allowance(args.owner, spender)) as bigint;
      return { key: k, tokenAddress, spender, allowance };
    } catch {
      return { key: k, tokenAddress, spender, allowance: 0n };
    }
  });

  const active = allowanceResults.filter((r) => r.allowance > 0n);

  // Metadata per token
  const uniqueTokens = Array.from(new Set(active.map((r) => r.tokenAddress)));
  const metaByToken = new Map<string, { symbol: string | null; name: string | null; decimals: number | null }>();
  await asyncPool(10, uniqueTokens, async (tokenAddress) => {
    const meta = await getTokenMetadata(chainId, tokenAddress);
    metaByToken.set(tokenAddress.toLowerCase(), meta);
    return meta;
  });

  // Spender type per spender
  const uniqueSpenders = Array.from(new Set(active.map((r) => r.spender)));
  const spenderTypeByAddr = new Map<string, SpenderType>();
  await asyncPool(10, uniqueSpenders, async (spender) => {
    const t = await getSpenderType(spender);
    spenderTypeByAddr.set(spender.toLowerCase(), t);
    return t;
  });

  const nowMs = Date.now();

  const lines: ApprovalLine[] = active.map((r) => {
    const meta = metaByToken.get(r.tokenAddress.toLowerCase()) ?? { symbol: null, name: null, decimals: null };
    const spenderType = spenderTypeByAddr.get(r.spender.toLowerCase()) ?? "UNKNOWN";
    const { reputation } = getSpenderReputation(r.spender);

    const unlimited = isUnlimited(r.allowance, meta.decimals);
    const ageDays = daysBetween(nowMs, pairLastTs.get(r.key));

    const scored = scoreApprovalLine({
      chainId,
      tokenAddress: r.tokenAddress,
      allowanceRaw: r.allowance,
      decimals: meta.decimals,
      isUnlimited: unlimited,
      spenderReputation: reputation,
      spenderType,
      approvalAgeDays: ageDays
    });

    return {
      chainId,
      token_address: r.tokenAddress,
      token_symbol: meta.symbol,
      token_decimals: meta.decimals,
      spender_address: r.spender,
      spender_type: spenderType,
      allowance_raw: r.allowance.toString(),
      allowance_human: formatUnitsSafe(r.allowance, meta.decimals),
      is_unlimited: unlimited,
      risk_level: scored.riskLevel,
      action: scored.action,
      reason_codes: scored.reasonCodes,
      human_reason: scored.humanReason,
      revoke_link: buildRevokeLink(chainId, args.owner, r.tokenAddress, r.spender)
    };
  });

  // Order by urgency
  const riskRank = (r: ApprovalLine) => (r.risk_level === "HIGH" ? 0 : r.risk_level === "MEDIUM" ? 1 : 2);
  lines.sort((a, b) => {
    const ra = riskRank(a);
    const rb = riskRank(b);
    if (ra !== rb) return ra - rb;
    if (a.risk_level === "HIGH" && b.risk_level === "HIGH") {
      const am = isMajorToken(chainId, a.token_address) ? 0 : 1;
      const bm = isMajorToken(chainId, b.token_address) ? 0 : 1;
      if (am !== bm) return am - bm;
    }
    return a.token_address.localeCompare(b.token_address) || a.spender_address.localeCompare(b.spender_address);
  });

  const high = lines.filter((l) => l.risk_level === "HIGH").length;
  const med = lines.filter((l) => l.risk_level === "MEDIUM").length;
  const low = lines.filter((l) => l.risk_level === "LOW").length;
  const unlimitedCount = lines.filter((l) => l.is_unlimited).length;

  const overall = high > 0 ? "HIGH" : med > 0 ? "MEDIUM" : "LOW";

  const runtimeMs = Date.now() - t0;

  return {
    owner: args.owner,
    chainId,
    approvals: lines,
    warnings: warnings.length ? warnings : undefined,
    aggregates: {
      total_approvals: lines.length,
      unlimited_approvals: unlimitedCount,
      high_count: high,
      medium_count: med,
      low_count: low,
      overall_risk: overall
    },
    generated_at: new Date().toISOString(),
    provider: {
      approvals_events: "rpc_eth_getLogs",
      rpc: config.ethRpcUrl ?? ""
    },
    runtime_ms: runtimeMs
  };
}

export function buildTelegramSummary(report: ApprovalsReport, planLimit = 5): string {
  const top = report.approvals.filter((a) => a.risk_level === "HIGH").slice(0, planLimit);
  const lines: string[] = [];
  lines.push(`RISK: ${report.aggregates.overall_risk}`);
  lines.push(`Active approvals: ${report.aggregates.total_approvals}`);
  lines.push(`Unlimited approvals: ${report.aggregates.unlimited_approvals}`);
  lines.push("");
  if (top.length) {
    lines.push("REVOKE NOW:");
    top.forEach((t, i) => {
      const sym = t.token_symbol ?? t.token_address.slice(0, 6) + "…";
      lines.push(`${i + 1}) ${sym} -> spender ${t.spender_address.slice(0, 8)}… (${t.human_reason})`);
    });
  } else {
    lines.push("REVOKE NOW: none");
  }
  return lines.join("\n");
}


