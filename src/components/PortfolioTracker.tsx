"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  explorerNumber,
  formatExplorerAmount,
  getExplorerAddress,
  getExplorerAddressTxList,
  getExplorerPrice,
  getExplorerTokenBalances,
  type ExplorerAddress,
  type ExplorerPrice,
  type ExplorerTokenBalance,
  type ExplorerTxListItem,
} from "@/lib/explorer";
import {
  connectPelagus,
  getConnectedPelagusAccount,
  isPelagusAvailable,
} from "@/lib/pelagus";
import { shortAddress, usd, thousands, timeAgo } from "@/lib/format";

/** Transaction history is a secondary panel — it must never block balances. */
type TxState = "idle" | "loading" | "ready" | "failed";

export function PortfolioTracker() {
  const [account, setAccount] = useState<string | null>(null);
  const [address, setAddress] = useState<ExplorerAddress | null>(null);
  const [tokens, setTokens] = useState<ExplorerTokenBalance[]>([]);
  const [price, setPrice] = useState<ExplorerPrice | null>(null);
  const [txs, setTxs] = useState<ExplorerTxListItem[]>([]);
  const [txState, setTxState] = useState<TxState>("idle");
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasWallet, setHasWallet] = useState(true);

  // Abort an in-flight history fetch when the account changes or we unmount, so
  // a slow response can't overwrite newer data.
  const txAbort = useRef<AbortController | null>(null);

  const loadHistory = useCallback(async (target: string) => {
    txAbort.current?.abort();
    const controller = new AbortController();
    txAbort.current = controller;

    setTxState("loading");
    try {
      const items = await getExplorerAddressTxList(target, 15, {
        signal: controller.signal,
        timeoutMs: 20_000,
      });
      if (controller.signal.aborted) return;
      setTxs(items);
      setTxState("ready");
    } catch {
      if (controller.signal.aborted) return;
      setTxs([]);
      setTxState("failed");
    }
  }, []);

  const loadPortfolio = useCallback(
    async (nextAccount: string) => {
      setLoading(true);
      setError(null);
      try {
        // Balances and token holdings come from the explorer (verified stable,
        // sub-second). These gate the loading state; history does not.
        const [nextAddress, nextTokens, nextPrice] = await Promise.all([
          getExplorerAddress(nextAccount),
          getExplorerTokenBalances(nextAccount),
          getExplorerPrice(),
        ]);
        setAccount(nextAccount);
        setAddress(nextAddress);
        setTokens(nextTokens.items.filter((item) => explorerNumber(item.balance) > 0));
        setPrice(nextPrice);
      } catch (cause) {
        setError((cause as Error).message);
        setLoading(false);
        return;
      }
      setLoading(false);

      // Fire-and-forget: history loads in its own lane with its own state.
      void loadHistory(nextAccount);
    },
    [loadHistory],
  );

  const reset = useCallback(() => {
    txAbort.current?.abort();
    setAccount(null);
    setAddress(null);
    setTokens([]);
    setTxs([]);
    setTxState("idle");
  }, []);

  useEffect(() => {
    setHasWallet(isPelagusAvailable());

    let alive = true;
    // Silent check only — never opens the Pelagus popup. The approval prompt is
    // triggered exclusively by the Connect button, so the wallet only ever
    // handles one permission request at a time.
    getConnectedPelagusAccount()
      .then((connected) => {
        if (alive && connected) void loadPortfolio(connected);
      })
      .catch(() => undefined);

    const provider = typeof window !== "undefined" ? window.pelagus : undefined;
    const onAccountsChanged = (...args: unknown[]) => {
      const accounts = Array.isArray(args[0]) ? (args[0] as string[]) : [];
      if (accounts[0]) void loadPortfolio(accounts[0]);
      else reset();
    };
    const onChainChanged = () => {
      reset();
      setError("Network changed in Pelagus. Reconnect to reload your portfolio.");
    };
    provider?.on?.("accountsChanged", onAccountsChanged);
    provider?.on?.("chainChanged", onChainChanged);
    return () => {
      alive = false;
      txAbort.current?.abort();
      provider?.removeListener?.("accountsChanged", onAccountsChanged);
      provider?.removeListener?.("chainChanged", onChainChanged);
    };
  }, [loadPortfolio, reset]);

  async function connect() {
    setConnecting(true);
    setError(null);
    try {
      await loadPortfolio(await connectPelagus());
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setConnecting(false);
    }
  }

  const busy = loading || connecting;
  const quai = address ? explorerNumber(address.info.balance_quai) / 1e18 : 0;
  const qi = address ? explorerNumber(address.info.balance_qi) / 1e3 : 0;
  const lockedQuai = address ? explorerNumber(address.info.locked_balance_quai) / 1e18 : 0;
  const quaiValue = price ? quai * price.quai.usd : null;
  const qiValue = price ? qi * price.qi.usd : null;
  const totalValue = quaiValue != null && qiValue != null ? quaiValue + qiValue : null;

  return (
    <div className="space-y-5">
      <section className="card-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="stat-label">Pelagus portfolio</div>
            <h2 className="mt-1 text-2xl font-bold">Your Quai position</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Read-only balances from the official Quai Explorer index.
            </p>
          </div>
          {hasWallet ? (
            <button
              type="button"
              onClick={connect}
              disabled={busy}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
            >
              {connecting ? "Check Pelagus..." : loading ? "Loading..." : account ? "Refresh wallet" : "Connect Pelagus"}
            </button>
          ) : (
            <a
              href="https://pelaguswallet.io"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500"
            >
              Install Pelagus
            </a>
          )}
        </div>
        {account && (
          <div className="mono mt-4 inline-flex rounded-md bg-white/70 px-2 py-1 text-xs text-slate-600 dark:bg-slate-950/40 dark:text-slate-300">
            {shortAddress(account, 12, 8)}
          </div>
        )}
        {error && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        {connecting && !error && (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Waiting for approval in the Pelagus extension. Open it from the toolbar if no window appeared.
          </p>
        )}
      </section>

      {!hasWallet && (
        <section className="card text-sm text-slate-600 dark:text-slate-300">
          Pelagus was not detected in this browser. It is currently the only wallet with official Quai support.
        </section>
      )}

      {hasWallet && !account && !busy && !error && (
        <section className="card text-sm text-slate-600 dark:text-slate-300">
          Connect Pelagus to load QUAI, Qi, and token holdings. QuaiWatch never requests a transaction here.
        </section>
      )}

      {address && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="Portfolio value" value={totalValue != null ? usd(totalValue) : "-"} />
            <Metric
              label="QUAI"
              value={`${quai.toLocaleString("en-US", { maximumFractionDigits: 4 })} QUAI`}
              sub={
                lockedQuai > 0
                  ? `${quaiValue != null ? usd(quaiValue) : ""}${quaiValue != null ? " · " : ""}${lockedQuai.toLocaleString("en-US", { maximumFractionDigits: 4 })} locked`
                  : quaiValue != null
                    ? usd(quaiValue)
                    : undefined
              }
            />
            <Metric label="Qi" value={`${qi.toLocaleString("en-US", { maximumFractionDigits: 3 })} Qi`} sub={qiValue != null ? usd(qiValue) : undefined} />
            <Metric label="Transactions" value={thousands(address.info.tx_count)} />
          </div>

          <section className="card overflow-hidden p-0">
            <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <h2 className="text-sm font-semibold">Token holdings</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Token USD values are shown only when QuaiWatch has a verified free price source.</p>
            </div>
            {tokens.length === 0 ? <p className="p-4 text-sm text-slate-500">No indexed token holdings.</p> : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {tokens.map((item) => (
                  <div key={`${item.token_address}-${item.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <div><div className="font-medium">{item.token.symbol || "Unknown"}</div><div className="text-xs text-slate-500">{item.token.name}</div></div>
                    <div className="tabular-nums">{formatExplorerAmount(item.balance, item.token.decimals)}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card overflow-hidden p-0">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div>
                <h2 className="text-sm font-semibold">Recent transactions</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Last 15, newest first.
                </p>
              </div>
              {txState === "failed" && (
                <button
                  type="button"
                  onClick={() => account && void loadHistory(account)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  Retry
                </button>
              )}
            </div>

            {txState === "loading" && (
              <p className="p-4 text-sm text-slate-500 dark:text-slate-400">Loading transaction history...</p>
            )}
            {txState === "failed" && (
              <p className="p-4 text-sm text-slate-500 dark:text-slate-400">
                Transaction history could not be loaded right now. Balances above are unaffected.
              </p>
            )}
            {txState === "ready" && txs.length === 0 && (
              <p className="p-4 text-sm text-slate-500">No transactions found for this wallet.</p>
            )}
            {txState === "ready" && txs.length > 0 && (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {txs.map((tx) => {
                  const outbound = tx.from?.toLowerCase() === account?.toLowerCase();
                  const failed = tx.isError === "1" || tx.txreceipt_status === "0";
                  return (
                    <div key={tx.hash} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <div className="min-w-0">
                        <div className="mono truncate text-xs text-slate-600 dark:text-slate-300">{shortAddress(tx.hash, 10, 6)}</div>
                        <div className="text-xs text-slate-500">
                          {outbound ? "Sent" : "Received"} · {timeAgo(Number(tx.timeStamp) * 1000)}
                          {failed && <span className="text-rose-500"> · failed</span>}
                        </div>
                      </div>
                      <div className={`tabular-nums text-xs ${outbound ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                        {outbound ? "-" : "+"}
                        {(explorerNumber(tx.value) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 4 })} QUAI
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <p className="text-xs text-slate-500 dark:text-slate-400">Indexed through block {Number(address.info.last_balance_block).toLocaleString("en-US")}.</p>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <section className="card"><div className="stat-label">{label}</div><div className="stat-value">{value}</div>{sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}</section>;
}
