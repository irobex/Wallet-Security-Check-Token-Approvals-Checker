# Wallet Security Check — Token Approvals Checker (Revoke Unlimited Approvals)

Wallet Guard is a **read-only wallet security scan** that helps you **check ERC-20 token approvals** (allowances), detect **unlimited approvals**, and understand what you should **revoke** to reduce risk.

✅ No wallet connection  
✅ No signing  
✅ No seed phrase  
✅ Public address only (0x...)  

If you searched for: **wallet approvals check**, **revoke token approvals**, **unlimited approval risk**, **wallet security scan**, this is for you.

---

## What this tool does

Wallet Guard answers 3 practical questions:

1. **Which contracts can still spend your tokens?**  
2. **Which approvals are risky (unlimited / old / unknown spender)?**  
3. **What should you revoke now vs review later?**

The full report is delivered in Telegram in ~1–2 minutes after payment via **NOWPayments** (default: **USDT TRC20**).

---

## Quick start (Free Preview)

This repository includes a small free script that prints a basic approvals overview (no advanced risk scoring).

### Requirements
- Node.js 20+

### Run
```bash
cd scripts/free-approvals-viewer
npm install
node index.js 0x0000000000000000000000000000000000000000
The free preview is intentionally limited. For the full risk report with actionable recommendations, use the Telegram bot.

Get the full report in Telegram (NOWPayments)
Telegram bot delivers:

risk score (LOW / MEDIUM / HIGH)

top urgent revokes (what to revoke first)

full approvals table

CSV / HTML / PDF exports (depending on plan)

Telegram: https://t.me/WalletGuardSecurityBot

Pricing
Lite — 10 USDT *(NOWPayments min-amount constraint)*
Ethereum approvals overview

limited list of approvals

basic risk flags

CSV export

Pro — 25 USDT (recommended)
full Ethereum approvals list

risk scoring + clear actions: REVOKE NOW / REVIEW / OK

HTML report + CSV

revoke links per spender

Max — 79 USDT
everything in Pro

90-day interaction snapshot (best-effort)

30-day monitoring alerts for new risky approvals

PDF report + CSV

What you will see (example)
Example output (summary):

text
Копировать код
RISK: HIGH

Active approvals: 27
Unlimited approvals: 3

REVOKE NOW:
1) USDT -> spender 0xabc... (unlimited, unknown spender)
2) DAI  -> spender 0xdef... (unlimited, old approval)
3) WETH -> spender 0x123... (EOA spender)

Next steps:
- revoke the 3 approvals above
- review the remaining unknown spenders
Why unlimited token approvals are risky
An ERC-20 approval is permission for a contract (spender) to move your tokens.
If the approval is unlimited, that spender can potentially drain the token balance if the spender contract is compromised or malicious.

Common searches:

how to revoke token approvals

check allowance ERC20

revoke unlimited approval

wallet security check approvals

FAQ
Is it safe? Do you need my seed phrase?
No. Wallet Guard is read-only. It never asks for seed phrase, private keys, or signatures.

Do you connect my wallet?
No. You only provide a public address (0x...). We do not require wallet connections.

What networks are supported?
MVP focuses on Ethereum. Additional chains may be added later.

What do I actually do after I get the report?
You follow the report’s action list:

revoke approvals marked REVOKE NOW

review MEDIUM items

keep LOW items

Is this financial advice?
No. This is a security-oriented tool that explains token approvals and risks.

Keywords (SEO)
wallet security check, wallet approvals check, token approvals checker, revoke token approvals, revoke.cash, unlimited approval risk, ERC20 allowance checker, check allowance ERC20, wallet security scan, revoke unlimited approvals, token approval revoke, ethereum approvals checker, wallet risk report, approval scanner, allowance risk, revoke approvals safely, how to revoke approvals, check token approvals ethereum, approve spender risk, approval list wallet, wallet permissions audit, token allowance audit, crypto wallet security tool, approvals security, revoke approvals tool, token permissions checker, wallet permissions check, allowance scanner, approval risk score, revoke token permissions, wallet approval report, revoke ERC20 approvals

License
MIT (or your preferred license).

yaml
Копировать код
