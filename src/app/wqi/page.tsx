import { WqiTracker } from "@/components/WqiTracker";

export default function WqiPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Wrapped Qi</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Track WQI supply, holders, and on-chain activity on Cyprus-1.
        </p>
      </div>
      <WqiTracker />
    </div>
  );
}
