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
import { rpcCall } from "@/lib/quai";
import { QUAISCAN_BASE } from "@/lib/config";
import { shortAddress, usd, thousands, timeAgo, tokenAmount } from "@/lib/format";

/** How the current address was supplied. */
type Origin = "none" | "wallet" | "search";

/** Transaction history is a secondary panel — it must never block balances. */
type TxState = "idle" | "loading" | "ready" | "failed";

const PAGE_SIZE = 15;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function PortfolioView() {
  const [address, setAddress] = useState<string | null>(null);
  const [origin, setOrigin] = useState<Origin>("none");
  const [info, setInfo] = useState<ExplorerAddress | null>(null);
  const [tokens, setTokens] = useState<ExplorerTokenBalance[]>([]);
  const [price, setPrice] = useState<ExplorerPrice | null>(null);
  const [isContract, setIsContract] = useState(false);

  const [txs, setTxs] = useState<ExplorerTxListItem[]>([]);
  const [txState, setTxState] = useState<TxState>("idle");
  const [txPage, setTxPage] = useState(1);
  const [txHasMore, setTxHasMore] = useState(false);
  const [txLoadingMore, setTxLoadingMore] = useState(false);

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasWallet, setHasWallet] = useState(true);

  // Abort in-flight history when the address changes, so a slow reply can't
  // overwrite newer data.
  const txAbort = useRef<AbortController | null>(null);

  const loadHistory = useCallback(async (target: string) => {
    txAbort.current?.abort();
    const controller = new AbortController();
    txAbort.current = controller;

    setTxState("loading");
    setTxPage(1);
    try {
      const items = await getExplorerAddressTxList(target, PAGE_SIZE, 1, {
        signal: controller.signal,
        timeoutMs: 20_000,
      });
      if (controller.signal.aborted) return;
      setTxs(items);
      setTxHasMore(items.length === PAGE_SIZE);
      setTxState("ready");
    } catch {
      if (controller.signal.aborted) return;
      setTxs([]);
      setTxHasMore(false);
      setTxState("failed");
    }
  }, []);

  async function loadMoreTxs() {
    if (!address || txLoadingMore || !txHasMore) return;
    setTxLoadingMore(true);
    try {
      const next = txPage + 1;
      const items = await getExplorerAddressTxList(address, PAGE_SIZE, next, {
        timeoutMs: 20_000,
      });
      setTxs((prev) => [...prev, ...items]);
      setTxPage(next);
      setTxHasMore(items.length === PAGE_SIZE);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setTxLoadingMore(false);
    }
  }

  const load = useCallback(
    async (target: string, from: Origin) => {
      setLoading(true);
      setError(null);
      try {
        // Balances and holdings come from the explorer (verified stable, sub-second).
        // These gate the loading state; history does not.
        const [nextInfo, nextTokens, nextPrice] = await Promise.all([
          getExplorerAddress(target),
          getExplorerTokenBalances(target),
          getExplorerPrice(),
        ]);
        setAddress(target);
        setOrigin(from);
        setInfo(nextInfo);
        setTokens(nextTokens.items.filter((item) => explorerNumber(item.balance) > 0));
        setPrice(nextPrice);
      } catch (cause) {
        setError((cause as Error).message);
        setLoading(false);
        return;
      }
      setLoading(false);

      // The explorer's `info.type` is null even for contracts (verified against
      // the WQI token), so the contract flag comes from quai_getCode instead:
      // an EOA returns "0x", a contract returns bytecode.
      rpcCall<string>("quai_getCode", [target, "latest"])
        .then((code) => setIsContract(!!code && code.length > 2))
        .catch(() => setIsContract(false));

      // Fire-and-forget: history loads in its own lane with its own state.
      void loadHistory(target);
    },
    [loadHistory],
  );

  const reset = useCallback(() => {
    txAbort.current?.abort();
    setAddress(null);
    setOrigin("none");
    setInfo(null);
    setTokens([]);
    setTxs([]);
    setTxState("idle");
    setTxHasMore(false);
    setIsContract(false);
  }, []);

  useEffect(() => {
    setHasWallet(isPelagusAvailable());

    let alive = true;
    // Silent check only — never opens the Pelagus popup. The approval prompt is
    // triggered exclusively by the Connect button.
    getConnectedPelagusAccount()
      .then((connected) => {
        if (alive && connected) void load(connected, "wallet");
      })
      .catch(() => undefined);

    const provider = typeof window !== "undefined" ? window.pelagus : undefined;
    const onAccountsChanged = (...args: unknown[]) => {
      const accounts = Array.isArray(args[0]) ? (args[0] as string[]) : [];
      if (accounts[0]) void load(accounts[0], "wallet");
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
  }, [load, reset]);

  async function connect() {
    setConnecting(true);
    setError(null);
    try {
      await load(await connectPelagus(), "wallet");
      setQuery("");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setConnecting(false);
    }
  }

  function search(event: React.FormEvent) {
    event.preventDefault();
    const target = query.trim();
    if (!ADDRESS_RE.test(target)) {
      setError("Invalid address format. Must be 0x + 40 hex characters.");
      return;
    }
    void load(target, "search");
  }

  const busy = loading || connecting;
  const quai = info ? explorerNumber(info.info.balance_quai) / 1e18 : 0;
  const qi = info ? explorerNumber(info.info.balance_qi) / 1e3 : 0;
  const lockedQuai = info ? explorerNumber(info.info.locked_balance_quai) / 1e18 : 0;
  const lockedQi = info ? explorerNumber(info.info.locked_balance_qi) / 1e3 : 0;
  const quaiValue = price ? quai * price.quai.usd : null;
  const qiValue = price ? qi * price.qi.usd : null;
  const totalValue = quaiValue != null && qiValue != null ? quaiValue + qiValue : null;

  return (
    <div className="space-y-5">
      <section className="card-hero">
        <div className="stat-label">Portfolio</div>
        <h2 className="mt-1 text-2xl font-bold">
          {origin === "wallet" ? "Your Quai position" : origin === "search" ? "Address overview" : "Look up any Quai address"}
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Search any address, or connect Pelagus to load your own. Read-only — a transaction
          signature is never requested.
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <form onSubmit={search} className="flex flex-1 gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search address (0x...)"
              aria-label="Search any Quai address"
              spellCheck={false}
              className="mono min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              {loading && origin === "search" ? "..." : "Search"}
            </button>
          </form>

          <div className="flex items-center gap-2 sm:shrink-0">
            <span className="hidden text-xs uppercase tracking-wide text-slate-400 sm:inline">or</span>
            {hasWallet ? (
              <button
                type="button"
                onClick={connect}
                disabled={busy}
                className="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50 sm:flex-none"
              >
                {connecting
                  ? "Check Pelagus..."
                  : origin === "wallet"
                    ? "Refresh wallet"
                    : "Connect Pelagus"}
              </button>
            ) : (
              <a
                href="https://pelaguswallet.io"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-brand-500 sm:flex-none"
              >
                Install Pelagus
              </a>
            )}
          </div>
        </div>

        {address && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <a
              href={`${QUAISCAN_BASE}/address/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="link mono rounded-md bg-white/70 px-2 py-1 text-slate-600 dark:bg-slate-950/40 dark:text-slate-300"
            >
              {shortAddress(address, 12, 8)}
            </a>
            {origin === "wallet" && (
              <span className="rounded-md bg-brand-50 px-2 py-1 font-medium text-brand-700 dark:bg-brand-950/60 dark:text-brand-300">
                Your wallet
              </span>
            )}
            <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {isContract ? "Contract" : "Wallet"}
            </span>
            <button
              type="button"
              onClick={() => {
                reset();
                setQuery("");
                setError(null);
              }}
              className="rounded-md px-2 py-1 text-slate-500 underline-offset-2 hover:underline dark:text-slate-400"
            >
              Clear
            </button>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        {connecting && !error && (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Waiting for approval in the Pelagus extension. Open it from the toolbar if no window appeared.
          </p>
        )}
      </section>

      {!hasWallet && !address && (
        <section className="card text-sm text-slate-600 dark:text-slate-300">
          Pelagus was not detected in this browser. You can still search any address above —
          Pelagus is only needed to load your own wallet automatically.
        </section>
      )}

      {info && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="Total value" value={totalValue != null ? usd(totalValue, 2) : "-"} />
            <Metric
              label="QUAI"
              value={`${tokenAmount(quai)} QUAI`}
              sub={
                lockedQuai > 0
                  ? `${quaiValue != null ? usd(quaiValue, 2) + " · " : ""}${tokenAmount(lockedQuai)} locked`
                  : quaiValue != null
                    ? usd(quaiValue, 2)
                    : undefined
              }
            />
            <Metric
              label="Qi"
              value={`${tokenAmount(qi, 3)} Qi`}
              sub={
                lockedQi > 0
                  ? `${qiValue != null ? usd(qiValue, 2) + " · " : ""}${tokenAmount(lockedQi, 3)} locked`
                  : qiValue != null
                    ? usd(qiValue, 2)
                    : undefined
              }
            />
            <Metric
              label="Transactions"
              value={thousands(info.info.tx_count)}
              sub={`${thousands(info.info.token_transfer_count)} token transfers`}
            />
          </div>

          <section className="card overflow-hidden p-0">
            <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <h2 className="text-sm font-semibold">Token holdings</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                QRC-20 amounts. USD values are shown only where QuaiWatch has a verified free
                price source.
              </p>
            </div>
            {tokens.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No indexed token holdings.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {tokens.map((item) => (
                  <div
                    key={`${item.token_address}-${item.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="font-medium">{item.token.symbol || "Unknown"}</div>
                      <div className="truncate text-xs text-slate-500">{item.token.name}</div>
                    </div>
                    <div className="tabular-nums">
                      {formatExplorerAmount(item.balance, item.token.decimals)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card overflow-hidden p-0">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div>
                <h2 className="text-sm font-semibold">Transactions</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Newest first.</p>
              </div>
              {txState === "failed" && (
                <button
                  type="button"
                  onClick={() => address && void loadHistory(address)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  Retry
                </button>
              )}
            </div>

            {txState === "loading" && (
              <p className="p-4 text-sm text-slate-500 dark:text-slate-400">
                Loading transaction history...
              </p>
            )}
            {txState === "failed" && (
              <p className="p-4 text-sm text-slate-500 dark:text-slate-400">
                Transaction history could not be loaded right now. Balances above are unaffected.
              </p>
            )}
            {txState === "ready" && txs.length === 0 && (
              <p className="p-4 text-sm text-slate-500">No transactions found for this address.</p>
            )}
            {txState === "ready" && txs.length > 0 && (
              <>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {txs.map((tx) => (
                    <TxRow key={`${tx.hash}-${tx.blockNumber}`} tx={tx} address={address} />
                  ))}
                </div>
                {txHasMore && (
                  <div className="flex justify-center border-t border-slate-200 p-3 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={loadMoreTxs}
                      disabled={txLoadingMore}
                      className="rounded-lg border border-slate-200 px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      {txLoadingMore ? "Loading..." : "Load more"}
                    </button>
                  </div>
                )}
              </>
            )}
          </section>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Balances indexed through block{" "}
            {Number(info.info.last_balance_block).toLocaleString("en-US")} · data from the official
            Quai Explorer.
          </p>
        </>
      )}
    </div>
  );
}

function TxRow({ tx, address }: { tx: ExplorerTxListItem; address: string | null }) {
  const outbound = tx.from?.toLowerCase() === address?.toLowerCase();
  const failed = tx.isError === "1" || tx.txreceipt_status === "0";
  const value = explorerNumber(tx.value) / 1e18;
  const counterparty = outbound ? tx.to : tx.from;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={
            "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase " +
            (outbound
              ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400"
              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400")
          }
        >
          {outbound ? "Out" : "In"}
        </span>
        <div className="min-w-0">
          <a
            href={`${QUAISCAN_BASE}/tx/${tx.hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="link mono block truncate text-xs"
          >
            {shortAddress(tx.hash, 10, 6)}
          </a>
          <div className="truncate text-xs text-slate-500">
            {counterparty ? `${outbound ? "to" : "from"} ${shortAddress(counterparty)} · ` : ""}
            {timeAgo(Number(tx.timeStamp) * 1000)}
            {failed && <span className="text-rose-500"> · failed</span>}
          </div>
        </div>
      </div>
      <div
        className={`shrink-0 tabular-nums text-xs ${outbound ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}
      >
        {value > 0 ? `${outbound ? "-" : "+"}${tokenAmount(value)} QUAI` : "—"}
      </div>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <section className="card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </section>
  );
}
