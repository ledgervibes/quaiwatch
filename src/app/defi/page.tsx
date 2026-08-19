import { DefiAnalytics } from "@/components/DefiAnalytics";

export default function DefiPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">DeFi &amp; SOAP</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          DEX liquidity, token prices from pool reserves, and SOAP buyback-and-burn on Cyprus-1.
        </p>
      </div>
      <DefiAnalytics />
    </div>
  );
}
