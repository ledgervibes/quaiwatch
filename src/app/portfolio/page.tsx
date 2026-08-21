import { PortfolioView } from "@/components/PortfolioView";

export default function PortfolioPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">Portfolio</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Balances, token holdings, and transactions for any Quai address — or your own via Pelagus.
        </p>
      </div>
      <PortfolioView />
    </div>
  );
}
