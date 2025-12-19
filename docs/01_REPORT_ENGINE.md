# Wallet Guard — Wallet Check & Report Engine (Detailed Spec)

This document describes the **core logic**: how we analyze an Ethereum wallet for token approvals (allowances), assess risk, and generate user-facing reports.

Scope: **Read-only** analysis. No wallet connection. No signing. No private keys.

---

## 1) Core concepts

### 1.1 What is an "approval" in our product
In ERC-20, users grant a spender permission to move tokens via:
- `approve(spender, amount)` which sets an **allowance**.

A dangerous case is "unlimited approval":
- typically `MaxUint256` (2^256 - 1), or a very large number.

Our product produces:
- a list of allowances (token -> spender -> allowance),
- a risk score per allowance,
- an action list (revoke now / review / ok).

---

## 2) Data sources & strategy

There are multiple ways to discover approvals. For MVP and for reliability, we implement a layered strategy:

### 2.1 Strategy overview (recommended)
We need two sets:
1) Candidate spender addresses per token.
2) Current allowance for (owner, token, spender).

To avoid brute-forcing all spenders, we derive candidates from **historical Approval events**.

#### Layer A — Approval events index (primary)
- Fetch `Approval(owner, spender, value)` events **for the owner address**.
- Extract:
  - token contract address,
  - spender address,
  - block number / timestamp (if available),
  - value (raw allowance value at that moment).

This gives us candidate (token, spender) pairs.

#### Layer B — Current allowance snapshot (authoritative)
For each unique (token, spender) pair found in Layer A:
- call ERC-20 `allowance(owner, spender)` at latest block.
- keep only pairs where allowance > 0.

This ensures:
- if a user revoked later, current allowance becomes 0 and we drop it.

### 2.2 Practical note: indexing Approval events
Full-chain log search by address can be heavy via vanilla RPC. For MVP, choose one:
- a log indexing provider (best UX, fewer edge cases),
- or an RPC provider that supports efficient `eth_getLogs` queries with filtering.

Implementation must be modular:
- `ApprovalEventProvider` interface with at least one implementation.

---

## 3) ERC-20 handling details

### 3.1 Token metadata
For each token contract in results:
- `symbol()`, `decimals()`, `name()` (best-effort; handle reverts)
Cache token metadata in DB to avoid repeated calls.

### 3.2 Normalizing allowance
Represent allowance in two forms:
- raw `BigInt` (canonical),
- human string using decimals (for report display).

### 3.3 Unlimited allowance detection
Define `isUnlimited(allowanceRaw)`:

- True if allowanceRaw == MaxUint256
- OR allowanceRaw >= UNLIMITED_THRESHOLD_RAW

Where:
- `UNLIMITED_THRESHOLD_RAW` is computed per token as:
  - `10n ** BigInt(decimals) * 10_000_000_000n` (10 billion tokens)
This catches tokens where "unlimited" isn't exactly MaxUint256 but is still effectively unlimited.

---

## 4) Risk scoring

We compute:
- `risk_item` per allowance line
- `overall_risk` for the wallet (LOW / MEDIUM / HIGH)

### 4.1 Risk inputs per allowance line
For each (token, spender, allowance):
- `is_unlimited` (boolean)
- `token_is_major` (boolean) — major assets are more sensitive:
  - stablecoins, wrapped assets, top tokens
- `spender_reputation` (enum):
  - KNOWN_SAFE
  - KNOWN_RISKY
  - UNKNOWN
- `approval_age_days` (if we have timestamps)
- `last_seen_days` (optional if we add interaction heuristics later)
- `spender_type` (EOA vs contract):
  - `eth_getCode(spender)` length
- `token_value_hint` (optional; used later)

### 4.2 Minimal reputation system (MVP-safe)
MVP reputation must not be overly "smart". Keep it transparent:

- Maintain an allowlist of known DeFi spenders (optional, can be small).
- Maintain a denylist of known malicious contracts (optional, can be empty at MVP).
- Otherwise classify as UNKNOWN.

Reputation sources should be encoded as:
- `reputation_source`: `STATIC_LIST` | `USER_REPORT` | `PROVIDER` (future)

### 4.3 Risk classification rules (MVP)
Compute `risk_level` per approval line:

HIGH if any:
- is_unlimited AND spender_reputation == UNKNOWN AND token_is_major
- is_unlimited AND spender_reputation == KNOWN_RISKY
- allowance is very large (>= LARGE_THRESHOLD) AND token_is_major AND spender_reputation == UNKNOWN

MEDIUM if any:
- is_unlimited AND spender_reputation == KNOWN_SAFE (still dangerous if user doesn't need it)
- approval_age_days >= 180 AND allowance > 0 AND spender_reputation == UNKNOWN
- spender_type == EOA AND allowance > 0 (EOA spenders are often suspicious)
- spender has no contract code but appears as spender (EOA case)

LOW if:
- spender_reputation == KNOWN_SAFE AND allowance is small/moderate
- token is not major and allowance is small

### 4.4 Wallet overall risk
Overall risk:
- HIGH if any HIGH line exists
- else MEDIUM if any MEDIUM exists
- else LOW

---

## 5) Action generation (what user should do)

We produce:
- `REVOKE_NOW` for HIGH lines
- `REVIEW` for MEDIUM lines
- `OK` for LOW lines

### 5.1 Action ordering
Order by urgency:
1) HIGH + major tokens first
2) HIGH others
3) MEDIUM
4) LOW

Limit "top urgent" list to:
- Lite: 5 lines
- Pro/Max: 10 lines (configurable)

### 5.2 Explainability requirement
Each line must include:
- `reason_codes`: array of strings
- `human_reason`: a short explanation

Examples:
- `UNLIMITED_APPROVAL_UNKNOWN_SPENDER`
- `EOA_SPENDER`
- `OLD_APPROVAL`
- `KNOWN_RISKY_SPENDER`

---

## 6) Revoke links

We provide "where to revoke" links.

MVP:
- link to the main revoke site for the chain (Ethereum)
- include spender address and token address in the report line
- user instructions: "Search token and revoke spender".

If the revoke service supports pre-filling parameters:
- add optional query parameters (best-effort)

Implementation:
- `buildRevokeLink(chainId, owner, token, spender) -> url`

---

## 7) Report formats

We generate:
- Telegram message summary (always)
- CSV file (all plans)
- HTML report (Pro+)
- PDF report (Max)

### 7.1 Telegram summary (short)
Must include:
- overall risk
- counts: total approvals, unlimited approvals, high/medium counts
- top urgent actions (up to plan limit)
- CTA buttons: "Show HIGH", "Revoke links", "Download CSV"

### 7.2 CSV
Columns:
- chain
- token_address
- token_symbol
- token_decimals
- spender_address
- spender_type
- allowance_raw
- allowance_human
- is_unlimited
- risk_level
- action
- reason_codes (semicolon-separated)
- revoke_link

### 7.3 HTML
HTML sections:
- Risk summary box
- Top urgent revokes
- Full approvals table with filters (risk level tabs)
- Footer: disclaimers, read-only note

### 7.4 PDF
Render the HTML report to PDF using headless Chromium (Playwright).
PDF must be:
- A4
- readable in black/white
- include the same content as HTML (no interactive JS required)

---

## 8) Performance & limits

### 8.1 Time budget targets
- Lite: <= 20 seconds typical
- Pro: <= 60 seconds typical
- Max: <= 90 seconds typical

### 8.2 Safety limits (MVP)
To avoid expensive scans:
- max unique token contracts per wallet: 300
- max (token, spender) pairs: 2000
If exceeded:
- degrade gracefully: analyze top tokens by frequency of Approval events, and warn in report.

---

## 9) Storage model (data_json)

`reports.data_json` should include:
- owner, chain
- approvals array:
  - token metadata
  - spender
  - allowance raw/human
  - risk/action
  - revoke link
  - reason codes
- aggregates:
  - counts
  - overall risk
- generation metadata:
  - provider used
  - generated_at
  - runtime_ms

---

## 10) Testing requirements

### 10.1 Unit tests
- unlimited detection
- risk scoring rules
- revoke link builder
- CSV generator

### 10.2 Integration tests (optional MVP)
- sample wallet addresses in a testnet or a fixed forked block height
- mock providers if needed

---

## 11) Future extensions (not MVP but design must allow)
- multi-chain analysis (Arbitrum/Polygon)
- interaction-based heuristics (last used, suspicious patterns)
- known spender labeling via external datasets
- caching & incremental updates for monitoring subscriptions