/**
 * lib/pelagus.ts — Pelagus wallet connection (read-only).
 *
 * WHY RAW EIP-1193 INSTEAD OF quais BrowserProvider:
 * `BrowserProvider` runs a background network-detection loop on construction
 * (see provider-jsonrpc.ts `_start()` → `_detectNetwork()`, up to 5 retries with
 * exponential backoff). Every instance fires its own `quai_chainId` calls, and
 * creating more than one instance stacks concurrent requests onto the wallet,
 * which can leave the Pelagus popup stuck in a "please refresh" state instead of
 * showing the approve button.
 *
 * QuaiWatch only needs the connected ADDRESS — all chain data is read through
 * the explorer proxy, never through the wallet. So we talk to the injected
 * provider directly: no provider instance, no retry loop, no extra RPC traffic.
 *
 * Method names use the `quai_` namespace (not `eth_`), per Quai docs.
 */
import { CHAIN_ID } from "./config";

/** Error with the original EIP-1193 code preserved, so the UI can explain it. */
export class WalletError extends Error {
  code?: number;
  constructor(message: string, code?: number) {
    super(message);
    this.name = "WalletError";
    this.code = code;
  }
}

function getProvider() {
  if (typeof window === "undefined") {
    throw new WalletError("Wallet access is only available in the browser.");
  }
  const provider = window.pelagus;
  if (!provider) {
    throw new WalletError(
      "Pelagus wallet was not detected. Install Pelagus, then reload this page.",
    );
  }
  return provider;
}

/** True if the Pelagus extension injected itself into this page. */
export function isPelagusAvailable(): boolean {
  return typeof window !== "undefined" && !!window.pelagus;
}

/** Raw EIP-1193 request with the wallet's own error code preserved. */
async function request<T>(method: string, params: unknown[] = []): Promise<T> {
  const provider = getProvider();
  try {
    return (await provider.request({ method, params })) as T;
  } catch (cause) {
    const error = cause as { message?: string; code?: number };
    throw new WalletError(
      humanizeWalletError(error.code, error.message ?? `${method} failed`),
      error.code,
    );
  }
}

/** Turn EIP-1193 error codes into something a user can act on. */
function humanizeWalletError(code: number | undefined, fallback: string): string {
  switch (code) {
    case 4001:
      return "Connection request was rejected in Pelagus.";
    case 4100:
      return "Pelagus has not authorized this site yet. Open the extension and approve the connection.";
    case 4200:
      return "This Pelagus version does not support the requested method.";
    case 4900:
      return "Pelagus is not connected to any Quai network. Unlock the wallet and try again.";
    case 4901:
      return "Pelagus is not connected to the requested Quai chain.";
    default:
      return fallback;
  }
}

function parseChainId(raw: unknown): number {
  if (typeof raw === "string") {
    return raw.startsWith("0x") ? Number.parseInt(raw, 16) : Number(raw);
  }
  return Number(raw);
}

/**
 * Absolute URL of this site's favicon, shown by Pelagus in the approval popup.
 * Falls back to the conventional /favicon.ico path when no <link> is present.
 */
function faviconUrl(): string {
  if (typeof document === "undefined") return "";
  const link = document.querySelector<HTMLLinkElement>(
    "link[rel~='icon'], link[rel='shortcut icon']",
  );
  return new URL(link?.getAttribute("href") ?? "/favicon.ico", window.location.origin).href;
}

/** Read the chain ID currently selected in the wallet. */
export async function getPelagusChainId(): Promise<number> {
  return parseChainId(await request<string>("quai_chainId"));
}

/**
 * Prompt Pelagus for account access, then verify the network.
 *
 * PARAMS ARE REQUIRED. Pelagus reads `params` as `[title, faviconUrl]` and uses
 * them to build the permission request it renders in the approval popup
 * (background/services/provider-bridge → `quai_requestAccounts`). Sending an
 * empty array leaves both fields undefined, and the popup opens with nothing to
 * display ("Ups, nothing to see here") instead of an approve button. The quais
 * BrowserProvider also sends no params, which is why it fails the same way.
 *
 * Order matters too: accounts are requested FIRST. Several wallets refuse state
 * queries (like chain ID) until the site has been approved.
 */
export async function connectPelagus(): Promise<string> {
  const siteTitle = (typeof document !== "undefined" && document.title) || "QuaiWatch";
  const accounts = await request<string[]>("quai_requestAccounts", [
    siteTitle,
    faviconUrl(),
  ]);
  const account = accounts?.[0];
  if (!account || !/^0x[0-9a-fA-F]{40}$/.test(account)) {
    throw new WalletError("Pelagus did not return a valid Quai account.");
  }

  const chainId = await getPelagusChainId();
  if (chainId !== CHAIN_ID) {
    throw new WalletError(
      `Wrong network in Pelagus (chain ID ${chainId}). Switch to Quai mainnet (chain ID ${CHAIN_ID}).`,
    );
  }

  return account;
}

/**
 * Read the already-authorized account without prompting.
 * Returns null when Pelagus is missing, locked, or this site isn't approved.
 */
export async function getConnectedPelagusAccount(): Promise<string | null> {
  if (!isPelagusAvailable()) return null;
  try {
    const accounts = await request<string[]>("quai_accounts");
    return accounts?.[0] ?? null;
  } catch {
    // A locked or unapproved wallet is a normal state, not an error worth surfacing.
    return null;
  }
}
