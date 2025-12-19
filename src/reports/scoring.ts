import { isMajorToken } from "./majorTokens.js";
import type { SpenderReputation } from "./reputation.js";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type Action = "REVOKE_NOW" | "REVIEW" | "OK";

export type ScoreInput = {
  chainId: number;
  tokenAddress: string;
  allowanceRaw: bigint;
  decimals: number | null;
  isUnlimited: boolean;
  spenderReputation: SpenderReputation;
  spenderType: "EOA" | "CONTRACT" | "UNKNOWN";
  approvalAgeDays?: number;
};

export type ScoreOutput = {
  riskLevel: RiskLevel;
  action: Action;
  reasonCodes: string[];
  humanReason: string;
};

function largeThresholdRaw(decimals: number | null): bigint {
  if (decimals === null) return 10n ** 30n;
  // 1,000,000 tokens
  return 10n ** BigInt(decimals) * 1_000_000n;
}

export function scoreApprovalLine(input: ScoreInput): ScoreOutput {
  const tokenIsMajor = isMajorToken(input.chainId, input.tokenAddress);
  const reasons: string[] = [];

  const LARGE = input.allowanceRaw >= largeThresholdRaw(input.decimals);

  // HIGH rules
  if (input.isUnlimited && input.spenderReputation === "KNOWN_RISKY") {
    reasons.push("KNOWN_RISKY_SPENDER", "UNLIMITED_APPROVAL");
    return {
      riskLevel: "HIGH",
      action: "REVOKE_NOW",
      reasonCodes: reasons,
      humanReason: "Unlimited approval выдан подозрительному/вредоносному spender."
    };
  }

  if (input.isUnlimited && input.spenderReputation === "UNKNOWN" && tokenIsMajor) {
    reasons.push("UNLIMITED_APPROVAL_UNKNOWN_SPENDER", "MAJOR_TOKEN");
    return {
      riskLevel: "HIGH",
      action: "REVOKE_NOW",
      reasonCodes: reasons,
      humanReason: "Unlimited approval на крупный токен выдан неизвестному spender — высокий риск."
    };
  }

  if (LARGE && tokenIsMajor && input.spenderReputation === "UNKNOWN") {
    reasons.push("LARGE_ALLOWANCE_UNKNOWN_SPENDER", "MAJOR_TOKEN");
    return {
      riskLevel: "HIGH",
      action: "REVOKE_NOW",
      reasonCodes: reasons,
      humanReason: "Очень большой allowance на крупный токен выдан неизвестному spender."
    };
  }

  // MEDIUM rules
  if (input.isUnlimited && input.spenderReputation === "KNOWN_SAFE") {
    reasons.push("UNLIMITED_APPROVAL_KNOWN_SAFE");
    return {
      riskLevel: "MEDIUM",
      action: "REVIEW",
      reasonCodes: reasons,
      humanReason: "Unlimited approval даже известному сервису может быть лишним — стоит проверить."
    };
  }

  if (typeof input.approvalAgeDays === "number" && input.approvalAgeDays >= 180) {
    reasons.push("OLD_APPROVAL");
    return {
      riskLevel: "MEDIUM",
      action: "REVIEW",
      reasonCodes: reasons,
      humanReason: "Approval старый (>=180 дней). Если вы больше не используете сервис — лучше отозвать."
    };
  }

  if (input.spenderType === "EOA") {
    reasons.push("EOA_SPENDER");
    return {
      riskLevel: "MEDIUM",
      action: "REVIEW",
      reasonCodes: reasons,
      humanReason: "Spender выглядит как обычный EOA-адрес (не контракт) — это часто подозрительно."
    };
  }

  // LOW fallback
  if (input.spenderReputation === "KNOWN_SAFE" && !LARGE) {
    reasons.push("KNOWN_SAFE_SPENDER");
    return {
      riskLevel: "LOW",
      action: "OK",
      reasonCodes: reasons,
      humanReason: "Известный сервис и умеренный allowance."
    };
  }

  if (!tokenIsMajor && !LARGE) {
    reasons.push("NON_MAJOR_TOKEN");
    return {
      riskLevel: "LOW",
      action: "OK",
      reasonCodes: reasons,
      humanReason: "Не основной токен и небольшой allowance."
    };
  }

  // Default MEDIUM if none matched but allowance > 0
  reasons.push("UNKNOWN_SPENDER");
  return {
    riskLevel: "MEDIUM",
    action: "REVIEW",
    reasonCodes: reasons,
    humanReason: "Неизвестный spender — стоит проверить и при необходимости отозвать."
  };
}


