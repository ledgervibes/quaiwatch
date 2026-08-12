# Roadmap

Current release: **v2.0** — Phase 2 complete.

QuaiWatch ships in phases. Each completed phase bumps the version (Phase N done → vN.0). This file is kept in sync with `src/lib/roadmap.ts`, the single source of truth used by the app.

---

## ✅ Phase 1 — Core dashboard

- Network stats (block height, TPS, gas, addresses, transactions, utilization)
- Wallet explorer (QUAI balance + all QRC-20 holdings + transaction history)
- Live transaction feed
- Token discovery (all QRC-20 tokens)
- Rich list (top native QUAI holders)
- QUAI & Qi price — Qi derived on-chain from `quai_qiToQuai`

## ✅ Phase 2 — Price history

- QUAI price chart with 7D / 30D / 90D / 1Y ranges

## ⏳ Phase 3 — Telegram alert bot

- Real-time wallet alerts for incoming/outgoing QUAI and QRC-20 transfers

## Phase 4 — DeFi & SOAP analytics

- DEX TVL tracking
- QRC-20 prices derived from pool reserves
- SOAP buyback history

## Phase 5 — Wallet connect & public API

- Pelagus wallet connection
- Portfolio tracker
- Read-only public API for other developers

---

Phases 3–5 are planned directions, not commitments to a schedule. Everything is built on a 100% free stack (public Quai RPC, Quaiscan, Cloudflare).
