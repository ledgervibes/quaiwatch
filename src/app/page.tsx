import { NetworkOverview } from "@/components/NetworkOverview";
import { TransactionFeed } from "@/components/TransactionFeed";
import { PriceChart } from "@/components/PriceChart";

export default function Home() {
  return (
    <div className="space-y-6">
      <NetworkOverview />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PriceChart />
        </div>
        <div className="lg:col-span-1">
          <TransactionFeed />
        </div>
      </div>
    </div>
  );
}
