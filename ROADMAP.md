# Roadmap

Current release: **v6.0** — Phase 6 complete, Phase 7 in progress.

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

## ✅ Phase 3 — Telegram alert bot

- Multi-address watchlist ([@QuaiWatchAlertBot](https://t.me/QuaiWatchAlertBot))
- Alerts for QUAI (from 1 QUAI) and all QRC-20 transfers
- Miner block rewards (coinbase) ignored

## ✅ Phase 4 — Deeper analytics

- Miner analytics (block distribution, hashrate share)
- ETX composition breakdown (coinbase / cross-shard / conversion mix)
- Token holder distribution (top 50 holders)

## ✅ Phase 5 — Wrapped Qi (WQI) tracking

- WQI supply and holder distribution
- WQI transfer, mint, and burn activity
- Contract and transaction links to Quaiscan

## ✅ Phase 6 — DeFi & SOAP analytics

- DEX TVL, 24h volume, and estimated fees for the official Quainance pools,
  as reported by the Quai Explorer
- QRC-20 prices in QUAI derived from Quainance WQUAI reserves
- SOAP buyback & burn history

## 🚧 Phase 7 — Wallet connect & public API

- Pelagus wallet connection
- Portfolio tracker
- Read-only public API for other developers

### Phase 7 progress

- Pelagus read-only connection and chain ID validation
- Official Quai Explorer indexed portfolio data, reached through a same-origin
  Cloudflare Pages Function proxy (the explorer host sends no CORS headers)
- QUAI, Qi, and token holdings view; transaction history read from the
  explorer's Etherscan-compatible surface, which answers in under 2s where the
  native per-address feed 503s and Quaiscan takes 23–73s
- Read-only public API at `/api/v1/*` (`network`, `portfolio/{address}`,
  `defi`, `conversions`) — normalized, edge-cached, CORS-open, no API key
- Transaction signing is intentionally not requested

---

## Not on the roadmap yet (blocked — no data)

- **Cross-shard activity viewer** — only Cyprus-1 is active today
  (`quai_listRunningChains → [[0,0]]`). A 12-block scan showed 188/188 ETXs are
  coinbase, with zero cross-shard transfers. Will be added once the network
  expands to more zones; the data layer is already multi-zone-ready.

---

Phases 3–7 are planned directions, not commitments to a schedule. Everything is built on a 100% free stack (public Quai RPC, Quaiscan, Cloudflare).
