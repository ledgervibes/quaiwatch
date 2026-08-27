const STORAGE_KEY = "quaiwatch_watchlist";
const MAX_WATCHLIST = 10;

function normalizeAddress(addr: string): string {
  return addr.toLowerCase();
}

export function getWatchlist(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeAddress) : [];
  } catch {
    return [];
  }
}

export function addToWatchlist(addr: string): boolean {
  if (typeof window === "undefined") return false;
  const normalized = normalizeAddress(addr);
  const list = getWatchlist();
  if (list.includes(normalized)) return false;
  if (list.length >= MAX_WATCHLIST) return false;
  const updated = [normalized, ...list];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return true;
  } catch {
    return false;
  }
}

export function removeFromWatchlist(addr: string): void {
  if (typeof window === "undefined") return;
  const normalized = normalizeAddress(addr);
  const list = getWatchlist().filter((a) => a !== normalized);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function isInWatchlist(addr: string): boolean {
  if (typeof window === "undefined") return false;
  const normalized = normalizeAddress(addr);
  return getWatchlist().includes(normalized);
}