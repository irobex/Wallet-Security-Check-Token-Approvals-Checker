# Wallet Security Check — Token Approvals Checker (Revoke Unlimited Approvals)

Wallet Guard is a **read-only wallet security scan** that helps you **check ERC-20 token approvals** (allowances), detect **unlimited approvals**, and understand what you should **revoke** to reduce risk.

✅ No wallet connection  
✅ No signing  
✅ No seed phrase  
✅ Public address only (0x...)  

If you searched for: **wallet approvals check**, **revoke token approvals**, **unlimited approval risk**, **wallet security scan**, this is for you.

## What this repo contains

- Telegram bot (paid full reports, payment via **NOWPayments**; default: **USDT TRC20**)
- Workers:
  - payments worker (polls NOWPayments payment status)
  - reports worker (generates CSV/HTML/PDF)
  - monitoring worker (Max plan alerts)
- Free preview script (basic approvals overview)

## Quick start (Free Preview)

### Requirements
- Node.js 20+

### Run

```bash
cd scripts/free-approvals-viewer
npm install
node index.js 0x0000000000000000000000000000000000000000
```

## Local development (bot/workers)

1) Install deps:

```bash
npm install
```

2) Create `.env`:
- copy `env.example` → `.env`
- fill `BOT_TOKEN`, `DATABASE_URL`, `ETH_RPC_URL`, etc.

3) Start Postgres (docker):

```bash
docker compose up -d db
```

4) Run migrations:

```bash
npm run db:migrate
```

5) Run one process (example: bot):

```bash
npm run dev:bot
```

## Docker Compose (all services)

If you prefer running everything in Docker:

- set `DATABASE_URL=postgresql://walletguard:walletguard@db:5432/walletguard` in `.env`
- then:

```bash
docker compose up -d --build
docker compose logs -f
```

## Pricing (in Telegram)

- Lite — 3 USDT *(temporary for e2e payment testing)*
- Pro — 25 USDT
- Max — 79 USDT

## Docs

See `docs/`:
- `docs/project.md` — product+tech spec
- `docs/01_REPORT_ENGINE.md` — approvals/report engine spec
- `docs/03_DEBIAN12_SETUP.md` — Debian 12 Docker Compose deploy guide
- `docs/00_ROADMAP_RU.md` — execution roadmap (RU)
- `docs/CHANGELOG_RU.md` — dev change log (RU)


