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
} from "./db";
import {
  sendMessage,
  setCommands,
  MAIN_KEYBOARD,
  startText,
  helpText,
  supportText,
  supportButton,
  shortAddr,
} from "./telegram";
import { scan } from "./scanner";
import { rpc, formatUnits } from "./rpc";

const MAX_WALLETS = 20;
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const WEBHOOK_FLAG = "webhook_registered";

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
    ctx.waitUntil(runCron(env));
  },
};

async function runCron(env: Env): Promise<void> {
  // One-time webhook registration + command setup.
  const registered = await getState(env.DB, WEBHOOK_FLAG);
  if (!registered) {
    await registerWebhook(env);
    await setCommands(env.TELEGRAM_BOT_TOKEN);
    await setState(env.DB, WEBHOOK_FLAG, "1");
  }
  await scan(env);
}

async function registerWebhook(env: Env): Promise<void> {
  const secret = await webhookSecret(env.TELEGRAM_BOT_TOKEN);
  const url = env.PUBLIC_URL ? `${env.PUBLIC_URL}/tg` : undefined;
  if (!url) return;
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      secret_token: secret,
      allowed_updates: ["message"],
      drop_pending_updates: true,
    }),
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
    await sendMessage(token, chatId, await priceText(), { reply_markup: MAIN_KEYBOARD });
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

async function listText(env: Env, chatId: number): Promise<string> {
  const addrs = await listWatch(env.DB, chatId);
  if (addrs.length === 0) {
    return "You're not watching any wallets yet. Tap ➕ Add Wallet to start.";
  }
  const lines = addrs.map((a, i) => `${i + 1}. <code>${shortAddr(a)}</code>`);
  return `<b>📋 Your Wallets (${addrs.length}/${MAX_WALLETS})</b>\n\n${lines.join("\n")}\n\nUse /remove to stop watching one.`;
}

async function priceText(): Promise<string> {
  try {
    const cg = (await (
      await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=quai-network&vs_currencies=usd&include_24hr_change=true",
      )
    ).json()) as { "quai-network": { usd: number; usd_24h_change: number } };
    const quai = cg["quai-network"];
    // Qi price: quai_qiToQuai for 1,000,000 Qi (Qi has 3 decimals → 1e9 qits).
    const hexWei = await rpc<string>("quai_qiToQuai", ["0x3b9aca00", "latest"]);
    const wei = BigInt(hexWei);
    const quaiPerMillionQi = Number(formatUnits(wei, 18));
    const qiPerQuai = quaiPerMillionQi / 1_000_000;
    const qiUsd = qiPerQuai * quai.usd;
    const chg = quai.usd_24h_change;
    const chgStr = (chg >= 0 ? "+" : "") + chg.toFixed(2) + "%";
    return (
      `💰 <b>QUAI</b>  $${quai.usd.toFixed(6)}  (${chgStr} 24h)\n` +
      `🔸 <b>Qi</b>    $${qiUsd.toFixed(4)}  (1 Qi = ${qiPerQuai.toFixed(2)} QUAI)`
    );
  } catch {
    return "Price data is temporarily unavailable. Try again in a moment.";
  }
}
