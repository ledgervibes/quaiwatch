import { NetworkOverview } from "@/components/NetworkOverview";
import { TransactionFeed } from "@/components/TransactionFeed";
import { WalletExplorer } from "@/components/WalletExplorer";

export default function Home() {
  return (
    <div className="space-y-6">
      <NetworkOverview />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <WalletExplorer />
        <TransactionFeed />
      </div>
    </div>
  );
}
