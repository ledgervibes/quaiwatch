import { Metadata } from "next";
import { TokenDetailClient } from "./TokenDetailClient";

interface Props {
  params: Promise<{ address: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  return {
    title: `Token ${address} | QuaiWatch`,
    description: `Detail token QRC-20: holders, transfers, price chart, contract info.`,
  };
}

export async function generateStaticParams() {
  // Fetch known tokens at build time to pre-render important token pages
  try {
    const res = await fetch("https://quaiscan.io/api/v2/tokens?type=ERC-20", {
      headers: { Accept: "application/json" },
      next: { revalidate: false }, // No revalidation for static export
    });
    if (!res.ok) return [];
    const data = await res.json();
    const tokens = (data.items ?? []) as { address: string }[];
    // Pre-render top 50 tokens by holder count
    return tokens
      .slice(0, 50)
      .map((t) => ({ address: t.address.toLowerCase() }));
  } catch {
    // If fetch fails at build time, pre-render known important tokens
    return [
      { address: "0x002b2596ecf05c93a31ff916e8b456df6c77c750" }, // WQI
      { address: "0x006c3e2aaae5db1bcd11a1a097ce572312eaddbb" }, // WQUAI
      { address: "0x0000000000000000000000000000000000000000" }, // USDT (if exists)
    ].map((t) => ({ address: t.address }));
  }
}

export default function TokenDetailPage({ params }: { params: Promise<{ address: string }> }) {
  return <TokenDetailClient params={params} />;
}