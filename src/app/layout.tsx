import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import { HeaderNav } from "@/components/HeaderNav";

export const metadata: Metadata = {
  title: "QuaiWatch — Never Miss a Move on Quai",
  description:
    "Real-time analytics dashboard & alert system for Quai Network. Network stats, wallet explorer, live transaction feed, token discovery.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply theme before first paint to avoid flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('qw-theme');var d=s==='dark'||(s===null&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <div className="min-h-screen">
          <Header />
          <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/85">
      <div className="relative mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
          <Logo size={30} />
          <div className="leading-tight">
            <div className="text-lg font-bold tracking-tight">QuaiWatch</div>
            <div className="hidden text-[11px] text-slate-500 dark:text-slate-400 sm:block">
              Never Miss a Move on Quai.
            </div>
          </div>
        </Link>
        <HeaderNav />
      </div>
    </header>
  );
}
