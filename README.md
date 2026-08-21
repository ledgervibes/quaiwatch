<div align="center">

![QuaiWatch](brand/quaiwatch-banner-1500x500.png)

# QuaiWatch

**Never Miss a Move on Quai.**

Free, open-source analytics dashboard for [Quai Network](https://qu.ai).

[**Live → quaiwatch.pages.dev**](https://quaiwatch.pages.dev) · [X](https://x.com/QuaiWatch)

</div>

---

QuaiWatch tracks network stats, wallet balances, token holdings, and live
on-chain activity — built entirely on public Quai RPC and Quaiscan data. No
ads, no third-party tracking, no paid APIs. Traffic is measured with
Cloudflare Web Analytics (privacy-first, cookieless).

## Features

- **Network stats** — block height, TPS, gas price, total addresses &
  transactions, network utilization.
- **QUAI price chart** — historical price (7D / 30D / 90D / 1Y) from CoinGecko.
- **QUAI & Qi prices** — QUAI from CoinGecko; Qi derived on-chain from the
  protocol's own `quai_qiToQuai` conversion rate, since Qi isn't listed on any
  market data provider.
- **Portfolio** — one page for any address: search a `0x…` address, or connect
  Pelagus read-only to load your own. Shows QUAI, Qi, locked balances, USD value,
  token holdings, and paginated transaction history. A transaction signature is
  never requested.
- **Live transaction feed** — recent transactions with type filters
  (native / contract / coinbase).
- **Token discovery** — every QRC-20 token on the network with holders and
  supply.
- **Rich list** — top native QUAI holders.
- **Analytics** — mining distribution, network composition (ETX), and
  workshares, plus per-token holder distribution (top 50).
- **Wrapped Qi tracking** — WQI supply, holder distribution, and transfer
  activity including mint and burn events.
- **DeFi & SOAP** — official Quainance pools, TVL, 24h volume and estimated fees
  as reported by the Quai Explorer, plus SOAP buyback-and-burn history.
- **Telegram alert bot** — [@QuaiWatchAlertBot](https://t.me/QuaiWatchAlertBot)
  sends real-time alerts when QUAI (from 1 QUAI) or any QRC-20 token moves in or
  out of your watched wallets. Miner rewards (coinbase) are ignored.
- **Public API** — free, read-only, normalized JSON for other developers. See
  below.
- **Dark / light mode.**

## Public API

QuaiWatch exposes a free, read-only, normalized JSON API for other developers.
No API key, no signup. Start at **[`/api/v1`](https://quaiwatch.pages.dev/api/v1)** —
it is self-describing and lists every endpoint with a runnable example.

| Endpoint | Returns |
| --- | --- |
| `GET /api/v1` | Self-describing index of the API |
| `GET /api/v1/network` | Head block, supply, address counts, per-algorithm hashrate, QUAI/Qi prices |
| `GET /api/v1/portfolio/{address}` | QUAI + Qi balances (incl. locked), token holdings, USD valuation |
| `GET /api/v1/defi?days=1\|7\|30` | DEX TVL, 24h volume, estimated fees, per-pool breakdown |
| `GET /api/v1/conversions` | Daily Quai ↔ Qi conversion counts and volumes |

**Units.** This is the easiest thing to get wrong on Quai:

- QUAI amounts under `balances` and `valuation` are **already divided by 10^18**.
- Qi uses **3 decimals**, not 18. `balances.qi` is already divided by 10^3.
- `tokens[].balance` is decimal-adjusted; `tokens[].balanceRaw` is the raw
  integer string. Big integers are returned as **strings** to preserve precision.

**Errors.** Always `{"error": "message"}` with an appropriate status:
`400` invalid input (e.g. malformed address), `429` rate limited (includes a
`Retry-After` header), `502` upstream failure.

**Rate limit.** 60 requests/minute per IP on `/api/v1/*`, advertised via
`RateLimit-*` response headers. This exists because QuaiWatch reads the official
explorer server-side, and that upstream limit is counted per IP — shared across
all Cloudflare visitors. A second global guard keeps total upstream usage below
the explorer's ceiling so heavy API traffic can't take the dashboard down.
Responses are edge-cached (see each response's `Cache-Control`), so polling the
same endpoint is cheap.

**Transaction history is intentionally absent** from the portfolio endpoint.
Balances are sub-second, but history needs a separate upstream call with very
different latency, so bundling them would make every portfolio request as slow as
the slowest source. Use `/api/explorer/api?module=account&action=txlist&address=…`
(the proxied Etherscan-compatible surface) for history — that is what the
QuaiWatch UI itself does.

**Data quality.** Some explorer metrics are self-reported as `recovering` or
`provisional` while its exact-trace repair runs. QuaiWatch passes those values
through unchanged rather than hiding or guessing at them.

## Roadmap

QuaiWatch ships in phases — currently **v7.0** (all seven phases complete). See
[ROADMAP.md](ROADMAP.md) for the full plan.

## Technical notes

- **Chain**: Quai Network, chain ID `9`. The only active zone today is
  **Cyprus-1** (`quai_listRunningChains → [[0,0]]`). The data layer is
  multi-zone-ready in `src/lib/config.ts`.
- **RPC**: `https://rpc.quai.network/cyprus1` — the `quai_` namespace, not
  `eth_`. CORS is open, so the frontend calls it directly with no backend.
- **Quai Explorer**: `https://explorer.qu.ai` serves richer indexed data (TVL
  history, SOAP participation, per-algorithm hashrate, Quai↔Qi conversions) but
  sends **no CORS headers**, so the browser cannot call it directly. All access
  goes through a same-origin Cloudflare Pages Function at `/api/explorer/*`
  (`functions/api/explorer/[[path]].ts`) with a path allow-list and edge caching.
  Several address sub-resources are still unstable upstream — `balance-history`
  and `lockups` return 503 for every address tested, and the native
  `/api/address/{a}/transactions` 503s for low-activity wallets.
- **Address transaction history**: read from the explorer's
  **Etherscan-compatible** surface (`/api?module=account&action=txlist`), not the
  native endpoint and not Quaiscan. Measured: Etherscan-compat &lt;2s for every
  address tested (including ones the native endpoint 503s on), Quaiscan API v2
  23–73s for the same data, Quaiscan API v1 txlist 522/timeout.
- **Pelagus**: connected with raw EIP-1193 (`window.pelagus.request`) rather than
  the SDK's `BrowserProvider`, which runs a background network-detection retry
  loop per instance and can leave the approval popup stuck. QuaiWatch only needs
  the address; all chain data comes from the explorer proxy. See
  `src/lib/pelagus.ts`.
- **Qi decimals**: Qi uses **3 decimals**, not 18 like QUAI. This is defined in
  the `quais` SDK (`formatQi`) rather than the docs — assume 18 and every Qi
  amount is off by 10^15. See `src/lib/quai.ts`.
- **QRC-20 prices**: Quaiscan returns no price data for tokens
  (`exchange_rate` is always null), and no free market source exists. Token
  prices in QUAI on the DeFi page are derived from the WQUAI-side reserve of the
  official Quainance pools reported by the Quai Explorer. Tokens without a
  Quainance pool show amounts only.
- **DEX data is read from the official source, not re-derived.** The Quai
  Explorer publishes TVL attributed to the Quainance factory
  (`/api/stats/tvl` → `source.id: "quainance"`), so QuaiWatch reports the same
  numbers Quai does. Do **not** discover pools by scanning for the LP symbol
  `UNI-V2`: every such token on Cyprus-1 belongs to an unrelated Uniswap-V2
  deployment (factory `0x0006112e…bc57a9`, 18 pairs, verified on-chain), while
  Quainance LP tokens are `QNCE-V2`. Pricing against those pools reported ~$75.8k
  TVL where the official figure was ~$10.5k.
- **`quais` SDK**: currently alpha (`1.0.0-alpha.56`). It's pinned to an exact
  version and isolated in `src/lib/quai.ts` so a breaking change only touches
  one file.
- **Live feed**: polls Quaiscan every 5s rather than using WebSocket. Block
  time is ~4s, so a few seconds of lag on a dashboard feed is negligible. A
  `WebSocketProvider` is available in `src/lib/quai.ts` for a future upgrade.

## Stack

- [Next.js](https://nextjs.org) (static export) → [Cloudflare Pages](https://pages.cloudflare.com)
- [`quais`](https://www.npmjs.com/package/quais) SDK (isolated in one file)
- [Tailwind CSS](https://tailwindcss.com)
- [Recharts](https://recharts.org) (reserved for upcoming charts)
- TypeScript

## Development

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm build        # static export to ./out
pnpm typecheck
```

## Deploy

`output: "export"` produces a static `out/` folder, deployed to Cloudflare
Pages:

```bash
pnpm build
wrangler pages deploy out --project-name quaiwatch --branch master
```

## License

[MIT](LICENSE) © 2026 Ledger Vibes

## Disclaimer

Not financial advice. Not affiliated with Quai Network. All data comes from
public Quai RPC endpoints and Quaiscan.
