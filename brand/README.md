# QuaiWatch — Brand Assets

Visual assets for social media and branding. This folder is **not** deployed to the site.

## Files

| File | Size | Use for |
|------|------|---------|
| `quaiwatch-banner-1500x500.png` | 1500×500 | X account header / cover |
| `quaiwatch-logo-400.png` | 400×400 | X profile photo (X's recommended size) |
| `quaiwatch-logo-1024.png` | 1024×1024 | Telegram bot avatar, press, hi-res |
| `quaiwatch-alerts-1600x900.png` | 1600×900 | Social post — Telegram alerts launch (Phase 3) |
| `quaiwatch-defi-1600x900.png` | 1600×900 | Social post — DeFi analytics launch (Phase 6) |
| `quaiwatch-v7-1600x900.png` | 1600×900 | Social post — Portfolio & public API launch (Phase 7 / v7.0) |

## Design

- **Colors**: indigo `#6366f1` / `#4338ca` + cyan accent `#22d3ee`, near-black background `#0B0C0E` (matches the site theme).
- **Banner**: the line on the banner is the **real daily Quai transaction chart** (31 days, sourced from Quaiscan) — not random decoration. Key elements sit in the middle band so they aren't covered by the profile photo (which overlaps the bottom-left) or cropped by X.
- **Logo**: Q mark + pulse line + notification dot, identical to the site's navbar and favicon.
- **Post cards**: all three share one layout — brand row, headline left, a designed
  detail card on the right, CTA footer. The card is an **illustration, not a
  screenshot**: amounts are rounded and generic so no real wallet, balance, or
  address is ever exposed in a public post.

## Regenerating

Sources live in `src/*.html`. To re-render (e.g. change colors/text or update the chart data):

1. Run a local static server that serves the `src/` folder.
2. Open the HTML file in a browser with the viewport set to the exact target size
   (1500×500 for the banner, 400×400 / 1024×1024 for the logo).
3. Take a full-page screenshot at device scale → PNG.

The chart data in `banner.html` can be refreshed from:
`https://quaiscan.io/api/v2/stats/charts/transactions`
