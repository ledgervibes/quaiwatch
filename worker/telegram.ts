/**
 * worker/telegram.ts — Telegram Bot API helpers + command UI.
 */

const SUPPORT_ADDRESS = "0x0045F33e4b34775E0547193433de8B8F3CEd8Fc8";
const WEBSITE = "https://quaiwatch.pages.dev";
const QUAISCAN = "https://quaiscan.io";

export function api(token: string, method: string) {
  return `https://api.telegram.org/bot${token}/${method}`;
}

export async function tg(
  token: string,
  method: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await fetch(api(token, method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
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
): Promise<void> {
  await tg(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...extra,
  });
}

/** Register the bot command list (shown in the "/" menu). Idempotent. */
export async function setCommands(token: string): Promise<void> {
  await tg(token, "setMyCommands", {
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
