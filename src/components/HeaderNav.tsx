"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { StarIcon, CopyIcon, TrashIcon } from "@/components/ui";
import { shortAddress } from "@/lib/format";
import {
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  isInWatchlist,
} from "@/lib/storage";

const PRIMARY = [["/", "Dashboard"], ["/portfolio", "Portfolio"], ["/tokens", "Tokens"], ["/analytics", "Analytics"]] as const;
const EXPLORE = [["/wqi", "WQI"], ["/defi", "DeFi"], ["/richlist", "Rich List"]] as const;

export function HeaderNav() {
  const pathname = normalizePath(usePathname());
  const [open, setOpen] = useState(false);
  const [watchOpen, setWatchOpen] = useState(false);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const exploreActive = EXPLORE.some(([href]) => href === pathname);

  useEffect(() => {
    setWatchlist(getWatchlist());
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!watchOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setWatchOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [watchOpen]);

  function handleAddToWatchlist(addr: string) {
    if (addToWatchlist(addr)) {
      setWatchlist(getWatchlist());
    }
  }

  function handleRemoveFromWatchlist(addr: string, event: React.MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    removeFromWatchlist(addr);
    setWatchlist(getWatchlist());
  }

  function handleClearWatchlist() {
    if (confirm("Hapus semua address dari watchlist?")) {
      watchlist.forEach((addr) => removeFromWatchlist(addr));
      setWatchlist([]);
    }
  }

  return (
    <nav aria-label="Main navigation">
      <div className="hidden items-center gap-1 lg:flex">
        {PRIMARY.map(([href, label]) => <NavLink key={href} href={href} label={label} active={pathname === href} />)}
        <details className="group relative">
          <summary className={buttonClass(exploreActive) + " cursor-pointer list-none [&::-webkit-details-marker]:hidden"}>Explore <ChevronDown /></summary>
          <div className="absolute right-0 top-[calc(100%+0.5rem)] w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            {EXPLORE.map(([href, label]) => <NavLink key={href} href={href} label={label} active={pathname === href} detail />)}
          </div>
        </details>
        <WatchlistButton watchlist={watchlist} onAdd={handleAddToWatchlist} onRemove={handleRemoveFromWatchlist} onClear={handleClearWatchlist} />
        <SettingsLink active={pathname === "/settings"} />
        <ThemeToggle />
      </div>

      <div className="flex items-center gap-1 lg:hidden">
        <ThemeToggle />
        <button type="button" className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="mobile-navigation" aria-label={open ? "Close navigation menu" : "Open navigation menu"}>
          {open ? <CloseIcon /> : <MenuIcon />}
        </button>
      </div>

      {open && (
        <div id="mobile-navigation" className="absolute inset-x-0 top-full border-b border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/95 lg:hidden">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-1">
            {[...PRIMARY, ...EXPLORE].map(([href, label]) => <MobileLink key={href} href={href} label={label} active={pathname === href} close={() => setOpen(false)} />)}
            <MobileLink href="/settings" label="Settings" active={pathname === "/settings"} close={() => setOpen(false)} />
          </div>
        </div>
      )}
    </nav>
  );
}

function WatchlistButton({
  watchlist,
  onAdd,
  onRemove,
  onClear,
}: {
  watchlist: string[];
  onAdd: (addr: string) => void;
  onRemove: (addr: string, event: React.MouseEvent) => void;
  onClear: () => void;
}) {
  const currentPath = typeof window !== "undefined" ? normalizePath(window.location.pathname) : "";
  const isPortfolio = currentPath === "/portfolio";
  const currentAddr = isPortfolio ? new URLSearchParams(window.location.search).get("address") : null;
  const inWatchlist = currentAddr ? isInWatchlist(currentAddr) : false;

  if (!isPortfolio || !currentAddr) {
    return (
      <button
        type="button"
        className={buttonClass(false)}
        title="Buka halaman Portfolio untuk menambah address ke watchlist"
      >
        <StarIcon className="text-slate-400" />
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        className={buttonClass(inWatchlist) + " relative"}
        onClick={() => {}}
        aria-haspopup="true"
        aria-expanded={false}
      >
        <StarIcon filled={inWatchlist} className={inWatchlist ? "text-amber-500" : ""} />
        {watchlist.length > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-semibold text-white">{watchlist.length > 9 ? "9+" : watchlist.length}</span>
        )}
      </button>

      <details className="absolute right-0 top-full z-50 mt-2 w-80 origin-top-right animate-[scale-in_150ms_ease-out]">
        <summary className="sr-only">Watchlist</summary>
        <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between px-2 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>My Addresses</span>
            <span className="text-amber-600 dark:text-amber-400">{watchlist.length}/10</span>
          </div>
          {watchlist.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-slate-500 dark:text-slate-400">Belum ada address. Klik ★ di halaman Portfolio untuk menambah.</p>
          ) : (
            <ul className="max-h-60 overflow-auto">
              {watchlist.map((addr) => (
                <li key={addr}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.location.href = `/portfolio?address=${addr}`;
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <span className="truncate font-mono text-slate-700 dark:text-slate-300">{shortAddress(addr)}</span>
                    <button
                      type="button"
                      onClick={(e) => onRemove(addr, e)}
                      className="shrink-0 p-1 text-slate-400 hover:text-rose-500 transition-colors"
                      aria-label={`Hapus ${shortAddress(addr)} dari watchlist`}
                    >
                      <TrashIcon />
                    </button>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-800">
            <button
              type="button"
              onClick={onClear}
              className="w-full flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-rose-600 transition-colors dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <TrashIcon />
              Clear all
            </button>
          </div>
        </div>
      </details>
    </div>
  );
}

function NavLink({ href, label, active, detail = false }: { href: string; label: string; active: boolean; detail?: boolean }) {
  return <Link href={href} aria-current={active ? "page" : undefined} className={detail ? "block rounded-xl px-3 py-3 hover:bg-slate-100 dark:hover:bg-slate-800" : buttonClass(active)}><span className="block">{label}</span>{detail && <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">View {label.toLowerCase()} analytics</span>}</Link>;
}

function MobileLink({ href, label, active, close }: { href: string; label: string; active: boolean; close: () => void }) {
  return <Link href={href} onClick={close} aria-current={active ? "page" : undefined} className={buttonClass(active) + " min-h-11 justify-start"}>{label}</Link>;
}

function SettingsLink({ active }: { active: boolean }) {
  return <Link href="/settings" aria-current={active ? "page" : undefined} aria-label="Settings" title="Settings" className={buttonClass(active) + " h-11 w-11 justify-center border border-slate-200 px-0 dark:border-slate-800"}><SettingsIcon /></Link>;
}

function buttonClass(active: boolean) {
  return "flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 " + (active ? "bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white");
}

function normalizePath(pathname: string | null) { return !pathname || pathname === "/" ? "/" : pathname.replace(/\/$/, ""); }
function SettingsIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8-.3l-.1.1A2 2 0 1 1 4.4 17l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 7 4.4l.1.1a1.7 1.7 0 0 0 1.8.3h.2a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.8v.2a1.7 1.7 0 0 0 1.5 1h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg>; }
function ChevronDown() { return <svg className="transition-transform group-open:rotate-180" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>; }
function MenuIcon() { return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>; }
function CloseIcon() { return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>; }