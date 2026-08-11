"use client";

import { useState } from "react";
import { SUPPORT } from "@/lib/config";

/**
 * Settings page. Urutan sesuai permintaan user:
 *   1. Telegram Bot (coming soon)
 *   2. Buy Me a Coffee (alamat wallet + copy)
 *   3. Progress (v1.0 complete + deskripsi singkat)
 *   4. Disclaimer (dipindah dari footer)
 *   5. Links (GitHub + X, paling bawah)
 * Tanpa pemilihan tema (sudah ada di navbar toggle).
 */
export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-xl font-bold">Settings</h1>

      <TelegramSection />
      <CoffeeSection />
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
            Real-time wallet alerts for incoming &amp; outgoing transactions.
          </p>
        </div>
        <button
          disabled
          className="shrink-0 cursor-not-allowed rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-500"
        >
          Coming Soon
        </button>
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
      /* clipboard bisa gagal di beberapa konteks; abaikan */
    }
  }

  return (
    <section className="card">
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

function ProgressSection() {
  return (
    <section className="card text-center">
      <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        QuaiWatch v1.0 — Complete
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
