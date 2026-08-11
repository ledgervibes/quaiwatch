"use client";

import { usePathname } from "next/navigation";
import { SUPPORT } from "@/lib/config";

/**
 * Footer global. Disembunyikan di halaman /settings karena deskripsi, GitHub,
 * dan X sudah tampil di sana (biar gak duplikat).
 *
 * Catatan: next.config.ts pakai trailingSlash:true, jadi usePathname() balikin
 * "/settings/" (ada garis miring). Kita normalisasi dulu sebelum banding.
 */
export function Footer() {
  const pathname = usePathname();
  const path = (pathname ?? "").replace(/\/$/, "");
  if (path === "/settings") return null;

  return (
    <footer className="mx-auto max-w-7xl px-4 py-8 text-center">
      <p className="mx-auto max-w-md text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        QuaiWatch — real-time analytics and alerts for Quai Network. Track
        wallets, tokens, and on-chain activity in one place.
      </p>
      <div className="mt-3 flex items-center justify-center gap-4 text-slate-400 dark:text-slate-500">
        <a
          href={SUPPORT.githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-slate-700 dark:hover:text-slate-200"
          aria-label="GitHub"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.09.68-.22.68-.48 0-.24-.01-.87-.01-1.7-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02.8-.22 1.65-.33 2.5-.34.85 0 1.7.12 2.5.34 1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85 0 1.34-.01 2.42-.01 2.75 0 .27.18.58.69.48A10.01 10.01 0 0 0 22 12c0-5.52-4.48-10-10-10z" />
          </svg>
        </a>
        <a
          href={SUPPORT.xUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-slate-700 dark:hover:text-slate-200"
          aria-label="X"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
          </svg>
        </a>
      </div>
    </footer>
  );
}
