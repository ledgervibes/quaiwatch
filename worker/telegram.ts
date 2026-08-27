/**
 * worker/telegram.ts — Telegram Bot API helpers + command UI.
 *
 * DELIVERY IS VERIFIED, NOT ASSUMED. Telegram answers HTTP 200 with
 * `{"ok": false, ...}` for a blocked bot, an invalid chat, a rate limit, or
 * malformed HTML. Treating that as success is what makes an alert disappear
 * silently, so every call here reports whether Telegram actually accepted it and
 * the caller decides what to do.
 */

const SUPPORT_ADDRESS = "0x0045F33e4b34775E0547193433de8B8F3CEd8Fc8";
const WEBSITE = "https://quaiwatch.pages.dev";
const QUAISCAN = "https://quaiscan.io";

export function api(token: string, method: string) {
  return `https://api.telegram.org/bot${token}/${method}`;
}

/** Result of a Telegram API call. `retryable` distinguishes "try again" from "never works". */
export type TgResult = {
  ok: boolean;
  /** Telegram's error_code, when it returned one. */
  errorCode?: number;
  description?: string;
  /** True when retrying later could succeed (network, 429, 5xx). */
  retryable: boolean;
};

/**
 * Escape text for Telegram's HTML parse mode.
 *
 * Token symbols come from contract calldata, so they are untrusted input. An
 * unescaped `<`, `>`, or `&` makes Telegram reject the whole message, which
 * previously turned a hostile or malformed token into a dropped alert.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const TIMEOUT_MS = 10_000;

export async function tg(
  token: string,
  method: string,
  payload: Record<string, unknown>,
): Promise<TgResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(api(token, method), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    // 429 and 5xx are transient; 4xx (except 429) means the request itself is wrong.
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as
        | { description?: string; error_code?: number }
        | null;
      return {
        ok: false,
        errorCode: body?.error_code ?? res.status,
        description: body?.description ?? `HTTP ${res.status}`,
        retryable: res.status === 429 || res.status >= 500,
      };
    }

    const body = (await res.json().catch(() => null)) as
      | { ok?: boolean; description?: string; error_code?: number }
      | null;
    if (!body || body.ok !== true) {
      const code = body?.error_code;
      return {
        ok: false,
        errorCode: code,
        description: body?.description ?? "Telegram returned ok:false",
        // 403 = bot blocked / kicked, 400 = bad request: retrying never helps.
        retryable: code === 429 || (code !== undefined && code >= 500),
      };
    }
    return { ok: true, retryable: false };
  } catch (cause) {
    // Network failure or timeout — always worth retrying.
    return {
      ok: false,
      description: (cause as Error).message,
      retryable: true,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Persistent reply keyboard shown under the input box. */
export const MAIN_KEYBOARD = {
  keyboard: [
    [{ text: "➕ Add Wallet" }, { text: "📋 My Wallets" }],
    [{ text: "💰 QUAI Price" }, { text: "❓ Help" }],
    [{ text: "☕ Support" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

export async function sendMessage(
  token: string,
  chatId: number,
  text: string,
  extra: Record<string, unknown> = {},
): Promise<TgResult> {
  return tg(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...extra,
  });
}

/** Register the bot command list (shown in the "/" menu). Idempotent. */
export async function setCommands(token: string): Promise<TgResult> {
  return tg(token, "setMyCommands", {
    commands: [
      { command: "start", description: "Start the bot" },
      { command: "add", description: "Watch a new address" },
      { command: "list", description: "Show your watched wallets" },
      { command: "price", description: "QUAI & Qi price" },
      { command: "remove", description: "Stop watching an address" },
      { command: "support", description: "Support QuaiWatch" },
      { command: "help", description: "How the bot works" },
    ],
  });
}

// ---- message builders ----

export function startText(): string {
  return (
    "<b>👋 QuaiWatch Alert Bot</b>\n\n" +
    "Get notified when QUAI or any QRC-20 token moves in or out of your wallets.\n\n" +
    "Tap <b>➕ Add Wallet</b> and send a Quai address to start."
  );
}

export function helpText(): string {
  return (
    "<b>QuaiWatch Alert Bot — Help</b>\n\n" +
    "Watch any Quai address and get a Telegram alert when it sends or receives QUAI or QRC-20 tokens.\n\n" +
    "<b>Commands</b>\n" +
    "/add — watch a new address\n" +
    "/list — show your wallets\n" +
    "/remove — stop watching an address\n" +
    "/price — QUAI &amp; Qi price\n" +
    "/support — support the project\n" +
    "/help — this message\n\n" +
    "<b>Notes</b>\n" +
    "• QUAI transfers are alerted from 1 QUAI and up.\n" +
    "• Contract payouts (claims, withdrawals, rewards) are included.\n" +
    "• All QRC-20 token transfers are alerted.\n" +
    "• Miner block rewards (coinbase) are ignored.\n" +
    "• Qi is not supported (no public RPC method)."
  );
}

export function supportText(): string {
  return (
    "<b>☕ Buy Me a Coffee</b>\n\n" +
    "QuaiWatch is free and ad-free. If it helps you, consider supporting development.\n\n" +
    "<b>QUAI · Cyprus-1</b>\n" +
    `<code>${SUPPORT_ADDRESS}</code>\n` +
    "<i>Tap the address to copy.</i>\n\n" +
    "⚠️ QUAI only. Do not send Qi to this address."
  );
}

export const supportButton = {
  inline_keyboard: [[{ text: "🌐 View on website", url: `${WEBSITE}/settings#support` }]],
};

export function txUrl(hash: string): string {
  return `${QUAISCAN}/tx/${hash}`;
}

export function shortAddr(a: string): string {
  return `${a.slice(0, 8)}…${a.slice(-4)}`;
}
