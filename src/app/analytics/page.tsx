import { MinerStats } from "@/components/MinerStats";

export default function AnalyticsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Analytics</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Mining distribution, network composition, and workshares — computed
          live from recent Quai blocks.
        </p>
      </div>
      <MinerStats />
    </div>
  );
}
