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

- Multi-address watchlist
- Custom alert threshold (only notify above a chosen amount)
- Alerts for QUAI and all QRC-20 transfers

## Phase 4 — Deeper analytics

- Miner analytics (block distribution, hashrate share)
- ETX composition breakdown (coinbase / cross-shard / conversion mix)
- Token holder distribution (top 50 holders)

## Phase 5 — Wrapped Qi (WQI) tracking

- WQI holders, transfers, and activity — the Qi ↔ Quai-ledger flow

## Phase 6 — DeFi & SOAP analytics

- DEX TVL tracking
- QRC-20 prices derived from pool reserves
- SOAP buyback history

## Phase 7 — Wallet connect & public API

- Pelagus wallet connection
- Portfolio tracker
- Read-only public API for other developers

---

## Not on the roadmap yet (blocked — no data)

- **Cross-shard activity viewer** — only Cyprus-1 is active today
  (`quai_listRunningChains → [[0,0]]`). A 12-block scan showed 188/188 ETXs are
  coinbase, with zero cross-shard transfers. Will be added once the network
  expands to more zones; the data layer is already multi-zone-ready.
- **Quai ↔ Qi conversion monitoring** — protocol conversions (ETX subtype 2)
  are not yet visible in sampled blocks. Will be added once conversion activity
  appears on-chain.

---

Phases 3–7 are planned directions, not commitments to a schedule. Everything is built on a 100% free stack (public Quai RPC, Quaiscan, Cloudflare).
