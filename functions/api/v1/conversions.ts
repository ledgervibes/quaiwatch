/**
 * functions/api/v1/conversions.ts — GET /api/v1/conversions
 *
 * Quai <-> Qi conversion activity, normalized from the explorer's daily
 * aggregates. This surfaces the data that reopens the "conversion monitoring"
 * roadmap item (previously blocked for lack of data).
 */

import { explorerJson, json, jsonError } from "../../_lib/upstream";

interface Daily {
  items?: Array<{
    date: string;
    quaiToQiTxCount?: number;
    qiToQuaiTxCount?: number;
    quaiSentForConversion?: string;
    qiSentForConversion?: string;
    quaiReceivedFromConversion?: string;
    qiReceivedFromConversion?: string;
  }>;
}

export async function onRequestGet(): Promise<Response> {
  try {
    const daily = await explorerJson<Daily>("/api/stats/daily");
    const items = (daily.items ?? []).map((d) => ({
      date: d.date,
      quaiToQiTxCount: d.quaiToQiTxCount ?? 0,
      qiToQuaiTxCount: d.qiToQuaiTxCount ?? 0,
      quaiSentForConversion: d.quaiSentForConversion ?? "0",
      qiSentForConversion: d.qiSentForConversion ?? "0",
      quaiReceivedFromConversion: d.quaiReceivedFromConversion ?? "0",
      qiReceivedFromConversion: d.qiReceivedFromConversion ?? "0",
    }));
    return json({ days: items.length, items }, { cacheSeconds: 300 });
  } catch (cause) {
    return jsonError((cause as Error).message);
  }
}

export function onRequestOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    },
  });
}
