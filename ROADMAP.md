# Roadmap

Current release: **v7.0** — all seven phases complete.

QuaiWatch ships in phases. Each completed phase bumps the version (Phase N done → vN.0). This file is kept in sync with `src/lib/roadmap.ts`, the single source of truth used by the app.

---

## ✅ Phase 1 — Core dashboard

- Network stats (block height, TPS, gas, addresses, transactions, utilization)
- Address lookup — QUAI/Qi balances, QRC-20 holdings, transaction history
  (now part of the Portfolio page; `/wallet` redirects there)
- Live transaction feed
- Token discovery (all QRC-20 tokens)
- Rich list (top native QUAI holders)
- QUAI & Qi price — Qi derived on-chain from `quai_qiToQuai`

## ✅ Phase 2 — Price history

- QUAI price chart with 7D / 30D / 90D / 1Y ranges

## ✅ Phase 3 — Telegram alert bot

- Multi-address watchlist ([@QuaiWatchAlertBot](https://t.me/QuaiWatchAlertBot))
- Alerts for QUAI (from 1 QUAI) and all QRC-20 transfers
- Miner block rewards (coinbase) ignored

## ✅ Phase 4 — Deeper analytics

- Per-algorithm hashrate (KawPoW / SHA / Scrypt) from `quai_getMiningInfo`
- 24-hour block distribution per miner, from the official explorer's mining
  summary (~17k blocks) rather than a small local sample
- Quai ↔ Qi conversion activity — daily counts and volumes
- Workshares and ETX composition
- Token holder distribution (top 50)

## ✅ Phase 5 — Wrapped Qi (WQI) tracking

- WQI supply and holder distribution
- WQI transfer, mint, and burn activity
- Contract and transaction links to Quaiscan

## ✅ Phase 6 — DeFi & SOAP analytics

- DEX TVL, 24h volume, and estimated fees for the official Quainance pools,
  as reported by the Quai Explorer
- QRC-20 prices in QUAI derived from Quainance WQUAI reserves
- SOAP buyback & burn history

## ✅ Phase 7 — Wallet connect & public API

- Pelagus wallet connection (read-only, chain ID validated; transaction signing
  is intentionally never requested)
- Portfolio — one page for any address: search a `0x…` address or connect
  Pelagus. QUAI, Qi, locked balances, USD value, token holdings, and paginated
  transaction history, from the official Quai Explorer via a same-origin
  Cloudflare Pages Function proxy (the explorer host sends no CORS headers)
- Transaction history uses the explorer's Etherscan-compatible surface, which
  answers in under 2s where the native per-address feed 503s for low-activity
  wallets; it loads in its own lane so it never blocks balances
- Read-only public API at `/api/v1/*` (`network`, `portfolio/{address}`, `defi`,
  `conversions`) — normalized, edge-cached, CORS-open, no API key, rate limited

---

## Not on the roadmap yet (blocked — no data)

- **Cross-shard activity viewer** — only Cyprus-1 is active today
  (`quai_listRunningChains → [[0,0]]`). A 12-block scan showed 188/188 ETXs are
  coinbase, with zero cross-shard transfers. Will be added once the network
  expands to more zones; the data layer is already multi-zone-ready.

---

All seven phases are shipped. Everything is built on a 100% free stack: public Quai RPC, the official Quai Explorer, Quaiscan, and Cloudflare.
