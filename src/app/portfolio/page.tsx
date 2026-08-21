import { PortfolioTracker } from "@/components/PortfolioTracker";

export default function PortfolioPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">Portfolio</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Connect Pelagus and inspect your Quai holdings without signing a transaction.</p>
      </div>
      <PortfolioTracker />
    </div>
  );
}
