import { MinerStats } from "@/components/MinerStats";
import { ConversionStats } from "@/components/ConversionStats";

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Analytics</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Hashrate, block distribution, workshares, and Quai ↔ Qi conversions.
        </p>
      </div>
      <MinerStats />
      <ConversionStats />
    </div>
  );
}
