export type SpenderReputation = "KNOWN_SAFE" | "KNOWN_RISKY" | "UNKNOWN";

// MVP: small static lists (can be extended later or replaced by provider).
// Addresses must be lowercase.
const SAFE_SPENDERS = new Set<string>([
  // Example placeholders; fill later with real DeFi routers if desired.
]);

const RISKY_SPENDERS = new Set<string>([
  // Example: known malicious contracts; can be empty for MVP.
]);

export function getSpenderReputation(spenderAddress: string): {
  reputation: SpenderReputation;
  source: "STATIC_LIST" | null;
} {
  const s = spenderAddress.toLowerCase();
  if (RISKY_SPENDERS.has(s)) return { reputation: "KNOWN_RISKY", source: "STATIC_LIST" };
  if (SAFE_SPENDERS.has(s)) return { reputation: "KNOWN_SAFE", source: "STATIC_LIST" };
  return { reputation: "UNKNOWN", source: null };
}


