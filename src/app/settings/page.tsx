"use client";

import { useState } from "react";
import { SUPPORT } from "@/lib/config";
import { VERSION } from "@/lib/roadmap";

/**
 * Settings page. Section order:
 *   1. Telegram Bot (coming soon)
 *   2. Buy Me a Coffee (wallet address + copy)
 *   3. Where to Buy QUAI (CEX + DEX links)
 *   4. Progress (version complete + short description)
 *   5. Disclaimer (moved from the footer)
 *   6. Links (GitHub + X, at the bottom)
 * No theme selection (already available via the navbar toggle).
 */
export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-xl font-bold">Settings</h1>

      <TelegramSection />
      <CoffeeSection />
      <BuyQuaiSection />
      <ProgressSection />
      <DisclaimerSection />
      <LinksSection />
    </div>
  );
}

function TelegramSection() {
  return (
    <section className="card">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Telegram Bot</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Real-time wallet alerts for incoming & outgoing transactions.
          </p>
        </div>
        <a
          href="https://t.me/QuaiWatchAlertBot"
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500"
        >
          Open Bot
        </a>
      </div>
    </section>
  );
}

function CoffeeSection() {
  const [copied, setCopied] = useState(false);
  const addr = SUPPORT.quaiAddress;

  async function copy() {
    try {
      await navigator.clipboard.writeText(addr);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard may fail in some contexts; ignore */
    }
  }

  return (
    <section className="card" id="support">
      <h2 className="text-sm font-semibold">☕ Buy Me a Coffee</h2>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
        QuaiWatch is free and ad-free. If it helps you, consider supporting its
        development.
      </p>

      {addr ? (
        <div className="mt-3">
          <div className="stat-label">QUAI · Cyprus-1</div>
          <div className="mt-1 flex items-center gap-2">
            <code className="mono flex-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800">
              {addr}
            </code>
            <button
              onClick={copy}
              className="shrink-0 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-500"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
            QUAI only. Do not send Qi to this address.
          </p>
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-500 dark:border-slate-700">
          Coming soon.
        </div>
      )}
    </section>
  );
}

function BuyQuaiSection() {
  return (
    <section className="card">
      <h2 className="text-sm font-semibold">Where to Buy QUAI</h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Official exchanges and DEXes. Always verify contract addresses.
      </p>
      <div className="mt-3 space-y-2">
        <BuyLink
          name="Kraken"
          type="CEX"
          url="https://pro.kraken.com/app/trade/quai-usd"
          desc="QUAI/USD spot trading"
        />
        <BuyLink
          name="Aerodrome (Base)"
          type="DEX"
          url="https://aerodrome.finance/swap?from=eth&to=0x5c97d726bf5130ae15408ce32bc764e458320d2f&chain0=8453&chain1=8453"
          desc="QUAI/WETH on Base"
        />
        <BuyLink
          name="Quainance"
          type="DEX"
          url="https://quainance.com"
          desc="QUAI/WQI, USDT pairs on Cyprus-1"
        />
      </div>
      <p className="mt-3 text-[11px] text-amber-600 dark:text-amber-400">
        Not financial advice. Verify contract addresses before trading.
      </p>
    </section>
  );
}

function BuyLink({
  name,
  type,
  url,
  desc,
}: {
  name: string;
  type: "CEX" | "DEX";
  url: string;
  desc: string;
}) {
  const badgeColor =
    type === "CEX"
      ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
      : "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400";
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{name}</span>
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${badgeColor}`}>
            {type}
          </span>
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{desc}</div>
      </div>
      <ExternalLinkIcon />
    </a>
  );
}

function ExternalLinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-slate-400" aria-hidden>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function ProgressSection() {
  return (
    <section className="card text-center">
      <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        QuaiWatch v{VERSION} — Complete
      </div>
      <p className="mx-auto mt-3 max-w-md text-sm text-slate-600 dark:text-slate-300">
        QuaiWatch is a real-time analytics dashboard for Quai Network. It tracks
        network stats, wallet balances, token holdings, and live on-chain
        activity — all from public RPC and explorer data.
      </p>
    </section>
  );
}

function DisclaimerSection() {
  return (
    <section className="card">
      <h2 className="text-sm font-semibold">Disclaimer</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        QuaiWatch is an independent project and is not affiliated with Quai
        Network. All data is sourced from public Quai RPC endpoints and
        Quaiscan. Nothing here is financial advice. QRC-20 token prices are not
        shown because no free price source exists — only QUAI and Qi display USD
        values.
      </p>
    </section>
  );
}

function LinksSection() {
  return (
    <section className="flex items-center justify-center gap-3 pt-1">
      <a
        href={SUPPORT.githubUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <GithubIcon /> GitHub
      </a>
      <a
        href={SUPPORT.xUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <XIcon /> X
      </a>
    </section>
  );
}

function GithubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.09.68-.22.68-.48 0-.24-.01-.87-.01-1.7-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02.8-.22 1.65-.33 2.5-.34.85 0 1.7.12 2.5.34 1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85 0 1.34-.01 2.42-.01 2.75 0 .27.18.58.69.48A10.01 10.01 0 0 0 22 12c0-5.52-4.48-10-10-10z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  );
}