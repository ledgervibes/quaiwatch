import { WalletExplorer } from "@/components/WalletExplorer";

export default function WalletPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">Wallet Explorer</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Search any address for its QUAI balance, QRC-20 token holdings, and
          transaction history.
        </p>
      </div>
      <WalletExplorer />
    </div>
  );
}
