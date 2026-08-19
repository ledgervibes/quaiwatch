"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";

const PRIMARY = [["/", "Dashboard"], ["/wallet", "Wallet"], ["/tokens", "Tokens"], ["/analytics", "Analytics"]] as const;
const EXPLORE = [["/wqi", "WQI"], ["/defi", "DeFi"], ["/richlist", "Rich List"]] as const;

export function HeaderNav() {
  const pathname = normalizePath(usePathname());
  const [open, setOpen] = useState(false);
  const exploreActive = EXPLORE.some(([href]) => href === pathname);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

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
function SettingsIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1A2 2 0 1 1 4.4 17l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 7 4.4l.1.1a1.7 1.7 0 0 0 1.8.3h.2a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.8v.2a1.7 1.7 0 0 0 1.5 1h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg>; }
function ChevronDown() { return <svg className="transition-transform group-open:rotate-180" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>; }
function MenuIcon() { return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>; }
function CloseIcon() { return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>; }
