import { FEED_URLS, type FeedName, type FeedResult, type QuakeFeature } from './types.js';

export class FeedError extends Error {
  constructor(
    message: string,
    public readonly feed: FeedName,
  ) {
    super(message);
    this.name = 'FeedError';
  }
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Convert one GeoJSON feature. Returns null when the fields the app needs are missing or not numbers. */
export function parseFeature(raw: unknown): QuakeFeature | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const f = raw as { id?: unknown; properties?: Record<string, unknown>; geometry?: { coordinates?: unknown } };
  const p = f.properties;
  const coords = f.geometry?.coordinates;
  if (!p || !Array.isArray(coords)) return null;
  const mag = num(p['mag']);
  const time = num(p['time']);
  const lon = num(coords[0]);
  const lat = num(coords[1]);
  const depth = num(coords[2]);
  if (mag === null || time === null || lon === null || lat === null || depth === null) return null;
  const url = typeof p['url'] === 'string' ? p['url'] : '';
  const id = typeof f.id === 'string' ? f.id : (url.split('/').filter(Boolean).pop() ?? 'unknown');
  return {
    id,
    mag,
    place: typeof p['place'] === 'string' && p['place'] !== '' ? p['place'] : 'Unnamed location',
    time,
    url,
    felt: num(p['felt']),
    alert: typeof p['alert'] === 'string' ? p['alert'] : null,
    tsunami: p['tsunami'] === 1,
    sig: num(p['sig']) ?? 0,
    lon,
    lat,
    depth,
  };
}

export function parseFeed(json: unknown): FeedResult {
  const root = json as { features?: unknown; metadata?: { generated?: unknown } };
  if (!root || !Array.isArray(root.features)) throw new Error('The feed did not contain a list of earthquakes');
  const features = root.features.map(parseFeature).filter((x): x is QuakeFeature => x !== null);
  return { features, generated: num(root.metadata?.generated) ?? Date.now() };
}

export type Fetcher = (url: string, init: { signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Fetch one feed with a timeout. Every failure becomes a FeedError with a readable message. */
export async function fetchFeed(name: FeedName, fetcher: Fetcher = (u, i) => fetch(u, i), timeoutMs = 8000): Promise<FeedResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetcher(FEED_URLS[name], { signal: controller.signal });
    if (!res.ok) throw new FeedError(`The USGS ${name} feed answered with HTTP ${res.status}.`, name);
    return parseFeed(await res.json());
  } catch (e) {
    if (e instanceof FeedError) throw e;
    if (controller.signal.aborted) throw new FeedError(`The USGS ${name} feed did not answer within ${Math.round(timeoutMs / 1000)} seconds.`, name);
    throw new FeedError(`The USGS ${name} feed could not be read: ${e instanceof Error ? e.message : String(e)}`, name);
  } finally {
    clearTimeout(timer);
  }
}
