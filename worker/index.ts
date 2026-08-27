/**
 * worker/index.ts — entrypoint. Handles the Telegram webhook (fetch) and the
 * scanner (scheduled/cron). Webhook is auto-registered on the first cron tick.
 */

import {
  type Env,
  addWatch,
  removeWatch,
  listWatch,
  countWatch,
  setAwaiting,
  getAwaiting,
  getState,
  setState,
  setTrackedBalance,
} from "./db";
import {
  sendMessage,
  setCommands,
  tg,
  MAIN_KEYBOARD,
  startText,
  helpText,
  supportText,
  supportButton,
  shortAddr,
  type TgResult,
} from "./telegram";
import { scan } from "./scanner";
import { getNativeBalances } from "./explorer";
import { rpc, formatUnits } from "./rpc";

const MAX_WALLETS = 10;
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const WEBHOOK_FLAG = "webhook_registered";
/**
 * Bump this when the webhook URL, secret derivation, or allowed_updates change
 * so an already-registered deployment re-registers itself on the next tick.
 */
const WEBHOOK_VERSION = "2";

/** Derive a webhook secret from the bot token (no second secret needed). */
async function webhookSecret(token: string): Promise<string> {
  const data = new TextEncoder().encode("quaiwatch-wh:" + token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "POST" && url.pathname === "/tg") {
      const secret = await webhookSecret(env.TELEGRAM_BOT_TOKEN);
      if (req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== secret) {
        return new Response("forbidden", { status: 403 });
      }
      try {
        const update = (await req.json()) as TgUpdate;
        await handleUpdate(env, update);
      } catch (e) {
        console.log("update error: " + (e as Error).message);
      }
      return new Response("ok");
    }
    return new Response("QuaiWatch bot", { status: 200 });
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // Surface failures instead of letting waitUntil swallow them: a silently
    // dying cron is exactly how missed alerts go unnoticed.
    ctx.waitUntil(
      runCron(env).catch((e) => {
        console.log("cron error: " + (e as Error).message);
      }),
    );
  },
};

async function runCron(env: Env): Promise<void> {
  // Webhook registration + command setup.
  //
  // The flag is only set after Telegram CONFIRMS registration. Setting it
  // unconditionally meant a failed first registration (bad token, wrong
  // PUBLIC_URL, DNS trouble, Telegram outage) was recorded as done and never
  // retried, leaving a bot that silently receives nothing until someone edits
  // D1 by hand.
  const registered = await getState(env.DB, WEBHOOK_FLAG);
  if (registered !== WEBHOOK_VERSION) {
    const hook = await registerWebhook(env);
    if (hook.ok) {
      const cmds = await setCommands(env.TELEGRAM_BOT_TOKEN);
      if (cmds.ok) {
        await setState(env.DB, WEBHOOK_FLAG, WEBHOOK_VERSION);
      } else {
        console.log(`setMyCommands failed: ${cmds.description ?? "unknown"}`);
      }
    } else {
      // Left unset on purpose: the next cron tick tries again.
      console.log(`setWebhook failed: ${hook.description ?? "unknown"}`);
    }
  }
  // Alerts are the product: never let a price-refresh failure abort them, and
  // never let a scan failure skip the price refresh.
  try {
    await scan(env);
  } catch (e) {
    console.log("scan error: " + (e as Error).message);
  }
  // Best-effort QUAI price refresh (CoinGecko rate-limits Cloudflare IPs, so
  // we retry every cron tick; occasional successes keep the cached value fresh).
  try {
    await refreshPrice(env);
  } catch (e) {
    console.log("price refresh error: " + (e as Error).message);
  }
}

/** Try to fetch QUAI price and store it in D1. Silent on failure. */
async function refreshPrice(env: Env): Promise<void> {
  const p = await fetchQuaiPrice();
  if (p) {
    await setState(env.DB, "quai_price", `${Date.now()}|${p.usd}|${p.chg}`);
  }
}

/**
 * Fetch QUAI price from CoinPaprika (primary) or CoinGecko (fallback).
 * CoinPaprika doesn't rate-limit Cloudflare's shared IPs like CoinGecko does.
 */
async function fetchQuaiPrice(): Promise<{ usd: number; chg: number } | null> {
  // Primary: CoinPaprika
  try {
    const res = await fetch("https://api.coinpaprika.com/v1/tickers/quai-quai-network", {
      headers: { Accept: "application/json", "User-Agent": "QuaiWatch/1.0" },
    });
    if (res.ok) {
      const j = (await res.json()) as {
        quotes?: { USD?: { price: number; percent_change_24h: number } };
      };
      const usd = j.quotes?.USD?.price;
      if (usd) return { usd, chg: j.quotes!.USD!.percent_change_24h ?? 0 };
    }
  } catch {
    /* try fallback */
  }
  // Fallback: CoinGecko
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=quai-network&vs_currencies=usd&include_24hr_change=true",
      { headers: { Accept: "application/json", "User-Agent": "QuaiWatch/1.0" } },
    );
    if (res.ok) {
      const cg = (await res.json()) as {
        "quai-network"?: { usd: number; usd_24h_change: number };
      };
      const q = cg["quai-network"];
      if (q) return { usd: q.usd, chg: q.usd_24h_change };
    }
  } catch {
    /* give up */
  }
  return null;
}

async function registerWebhook(env: Env): Promise<TgResult> {
  const secret = await webhookSecret(env.TELEGRAM_BOT_TOKEN);
  // PUBLIC_URL must point at THIS deployment. It is configuration, not a
  // guess — if it is missing, say so instead of reporting success.
  const base = env.PUBLIC_URL?.replace(/\/+$/, "");
  if (!base) {
    return { ok: false, description: "PUBLIC_URL is not configured", retryable: false };
  }
  return tg(env.TELEGRAM_BOT_TOKEN, "setWebhook", {
    url: `${base}/tg`,
    secret_token: secret,
    allowed_updates: ["message"],
    drop_pending_updates: true,
  });
}

interface TgUpdate {
  message?: {
    chat: { id: number };
    text?: string;
  };
}

async function handleUpdate(env: Env, update: TgUpdate): Promise<void> {
  const msg = update.message;
  if (!msg?.text) return;
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const token = env.TELEGRAM_BOT_TOKEN;

  // Command or button routing.
  const cmd = text.toLowerCase();

  if (cmd === "/start") {
    await setAwaiting(env.DB, chatId, null);
    await sendMessage(token, chatId, startText(), { reply_markup: MAIN_KEYBOARD });
    return;
  }
  if (cmd === "/help" || cmd === "❓ help") {
    await sendMessage(token, chatId, helpText(), { reply_markup: MAIN_KEYBOARD });
    return;
  }
  if (cmd === "/support" || cmd === "☕ support") {
    await sendMessage(token, chatId, supportText(), { reply_markup: supportButton });
    return;
  }
  if (cmd === "/price" || cmd === "💰 quai price") {
    await sendMessage(token, chatId, await priceText(env), { reply_markup: MAIN_KEYBOARD });
    return;
  }
  if (cmd === "/list" || cmd === "📋 my wallets") {
    await sendMessage(token, chatId, await listText(env, chatId), { reply_markup: MAIN_KEYBOARD });
    return;
  }
  if (cmd === "/add" || cmd === "➕ add wallet") {
    await setAwaiting(env.DB, chatId, "address");
    await sendMessage(token, chatId, "Send me a Quai address to watch (0x…).", {
      reply_markup: { force_reply: true, input_field_placeholder: "0x..." },
    });
    return;
  }
  if (cmd === "/remove") {
    await setAwaiting(env.DB, chatId, "remove");
    await sendMessage(token, chatId, "Send the address you want to stop watching.", {
      reply_markup: { force_reply: true, input_field_placeholder: "0x..." },
    });
    return;
  }

  // Free-text: depends on conversation state.
  const awaiting = await getAwaiting(env.DB, chatId);
  if (ADDR_RE.test(text)) {
    if (awaiting === "remove") {
      await removeWatch(env.DB, chatId, text);
      await setAwaiting(env.DB, chatId, null);
      await sendMessage(token, chatId, `🗑 Stopped watching <code>${shortAddr(text)}</code>.`, {
        reply_markup: MAIN_KEYBOARD,
      });
      return;
    }
    // default: treat as add
    const n = await countWatch(env.DB, chatId);
    if (n >= MAX_WALLETS) {
      await sendMessage(token, chatId, `You've reached the limit of ${MAX_WALLETS} wallets.`, {
        reply_markup: MAIN_KEYBOARD,
      });
      return;
    }
    await addWatch(env.DB, chatId, text);
    await setAwaiting(env.DB, chatId, null);
    // Seed the balance baseline immediately. The scanner only alerts on a
    // CHANGE from a known baseline, so seeding here keeps the blind window to
    // the moment of registration instead of the next cron tick.
    await seedBalanceBaseline(env, text.toLowerCase());
    const total = await countWatch(env.DB, chatId);
    await sendMessage(
      token,
      chatId,
      `✅ Now watching <code>${shortAddr(text)}</code>\n` +
        `You'll get alerts for QUAI and all QRC-20 transfers.\n` +
        `Watching ${total} of ${MAX_WALLETS} wallets.`,
      { reply_markup: MAIN_KEYBOARD },
    );
    return;
  }

  // Unrecognized input.
  await sendMessage(token, chatId, "Send a valid Quai address (0x…), or use the menu below.", {
    reply_markup: MAIN_KEYBOARD,
  });
}

/**
 * Record the current native balance so the scanner has a baseline to diff.
 *
 * Without a baseline the first observed balance is treated as "not news" (it
 * predates the watch), so seeding at registration time means the very next
 * contract payout is detected. Read through the explorer, not the RPC, because
 * the RPC rejects lowercase addresses (see worker/explorer.ts).
 */
async function seedBalanceBaseline(env: Env, address: string): Promise<void> {
  try {
    const head = parseInt(await rpc<string>("quai_blockNumber"), 16);
    const balances = await getNativeBalances([address]);
    const value = balances.get(address);
    if (value == null) return;
    await setTrackedBalance(env.DB, address, value, head);
  } catch (e) {
    // Non-fatal: the scanner seeds it on the next tick instead.
    console.log("seed balance failed: " + (e as Error).message);
  }
}

async function listText(env: Env, chatId: number): Promise<string> {
  const addrs = await listWatch(env.DB, chatId);
  if (addrs.length === 0) {
    return "You're not watching any wallets yet. Tap ➕ Add Wallet to start.";
  }
  const lines = addrs.map((a, i) => `${i + 1}. <code>${shortAddr(a)}</code>`);
  return `<b>📋 Your Wallets (${addrs.length}/${MAX_WALLETS})</b>\n\n${lines.join("\n")}\n\nUse /remove to stop watching one.`;
}

async function priceText(env: Env): Promise<string> {
  try {
    // Qi rate is cheap (Quai RPC, no rate limit) — always fresh.
    const hexWei = await rpc<string>("quai_qiToQuai", ["0x3b9aca00", "latest"]);
    const wei = BigInt(hexWei);
    const quaiPerMillionQi = Number(formatUnits(wei, 18));
    const qiPerQuai = quaiPerMillionQi / 1_000_000;

    // QUAI/USD is refreshed by the cron job (refreshPrice) and cached in D1.
    // The command itself reads the cache — it never calls CoinGecko directly,
    // so a user spamming /price can't trigger rate limits.
    let usd = 0;
    let chg = 0;
    const cached = await getState(env.DB, "quai_price");
    if (cached) {
      const [, u, c] = cached.split("|");
      usd = Number(u);
      chg = Number(c);
    } else {
      // No cached price yet (cron hasn't succeeded once). Try a direct fetch.
      const p = await fetchQuaiPrice();
      if (p) {
        usd = p.usd;
        chg = p.chg;
        await setState(env.DB, "quai_price", `${Date.now()}|${usd}|${chg}`);
      }
    }

    if (!usd) {
      // Still show the Qi rate even if USD is unavailable.
      return `🔸 <b>Qi</b>  1 Qi = ${qiPerQuai.toFixed(2)} QUAI\n\n(QUAI/USD price loading — try again in a minute.)`;
    }

    const qiUsd = qiPerQuai * usd;
    const chgStr = (chg >= 0 ? "+" : "") + chg.toFixed(2) + "%";
    return (
      `💰 <b>QUAI</b>  $${usd.toFixed(6)}  (${chgStr} 24h)\n` +
      `🔸 <b>Qi</b>    $${qiUsd.toFixed(4)}  (1 Qi = ${qiPerQuai.toFixed(2)} QUAI)`
    );
  } catch (e) {
    console.log("priceText error: " + (e as Error).message);
    return "Price data is temporarily unavailable. Try again in a moment.";
  }
}
