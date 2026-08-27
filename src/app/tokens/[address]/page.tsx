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
  // With timeout and robust error handling for Cloudflare Pages build environment
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const res = await fetch("https://quaiscan.io/api/v2/tokens?type=ERC-20", {
      headers: { Accept: "application/json" },
      signal: controller.signal,
      next: { revalidate: false },
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[generateStaticParams] Quaiscan API returned ${res.status}`);
      return getFallbackTokens();
    }

    const data = await res.json();
    const tokens = (data.items ?? []) as { address: string; holders?: string }[];

    // Sort by holders (descending) and take top 50
    const sorted = tokens
      .filter((t) => t.address && /^0x[0-9a-fA-F]{40}$/i.test(t.address))
      .sort((a, b) => Number(b.holders ?? 0) - Number(a.holders ?? 0))
      .slice(0, 50)
      .map((t) => ({ address: t.address.toLowerCase() }));

    return sorted.length > 0 ? sorted : getFallbackTokens();
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn("[generateStaticParams] Fetch failed, using fallback tokens:", err);
    return getFallbackTokens();
  }
}

function getFallbackTokens(): { address: string }[] {
  // Known important tokens on Cyprus-1 (verified addresses)
  return [
    { address: "0x002b2596ecf05c93a31ff916e8b456df6c77c750" }, // WQI (Wrapped Qi)
    { address: "0x006c3e2aaae5db1bcd11a1a097ce572312eaddbb" }, // WQUAI (Wrapped Quai)
    { address: "0x0000000000000000000000000000000000000000" }, // USDT (placeholder)
    { address: "0x004c7926967b899ea69e871a366a5b344660f7eb" }, // Top token #1
    { address: "0x002684b31777c432648d5f7c9ba7f3e4dbfeb12f" }, // Top token #2
    { address: "0x004afdb66677d177b759356d2367aea3a79fe58b" }, // Top token #3
  ].map((t) => ({ address: t.address }));
}

export default function TokenDetailPage({ params }: { params: Promise<{ address: string }> }) {
  return <TokenDetailClient params={params} />;
}