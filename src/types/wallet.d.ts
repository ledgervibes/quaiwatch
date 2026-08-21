/**
 * Pelagus injects an EIP-1193 provider at `window.pelagus`.
 *
 * Typed locally rather than importing quais' Eip1193Provider so that
 * lib/pelagus.ts has no dependency on the SDK — it only needs `request`.
 */
declare global {
  interface Window {
    pelagus?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: "accountsChanged" | "chainChanged", listener: (...args: unknown[]) => void) => void;
      removeListener?: (event: "accountsChanged" | "chainChanged", listener: (...args: unknown[]) => void) => void;
    };
  }
}

export {};
