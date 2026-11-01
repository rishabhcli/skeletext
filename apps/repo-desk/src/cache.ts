export interface CacheEntry {
  data: unknown;
  timestamp: number;
}

/** Check if a cache entry is still valid (less than 5 minutes old). */
export function isCacheValid(entry: CacheEntry, now: number): boolean {
  return now - entry.timestamp < 300_000;
}

/** Read a cache entry from localStorage. Returns null if not found or invalid. */
export function readCache(url: string): CacheEntry | null {
  try {
    const item = localStorage.getItem(url);
    if (item === null) {
      return null;
    }
    const parsed = JSON.parse(item) as CacheEntry;
    if (typeof parsed.timestamp !== 'number') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Write a cache entry to localStorage. Silently ignores errors. */
export function writeCache(url: string, data: unknown): void {
  try {
    const entry: CacheEntry = { data, timestamp: Date.now() };
    localStorage.setItem(url, JSON.stringify(entry));
  } catch {
    // Silently ignore errors (quota exceeded, SecurityError, etc.)
  }
}
