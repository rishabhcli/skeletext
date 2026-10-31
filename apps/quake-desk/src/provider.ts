import type { PageProvider, ProvidedPage } from '@skeletext/core';
import { fetchFeed, FeedError } from './feed.js';
import { FEED_URLS, type FeedName, type FeedResult } from './types.js';
import { buildAboutPage, buildDetailPage, buildHistogramPage, buildIndexPage, buildListSubpages, DETAIL_COUNT, DETAIL_FIRST, FASTEXT, strongest } from './pages.js';

export const PAGE_NUMBERS: readonly number[] = [100, 101, 102, ...Array.from({ length: DETAIL_COUNT }, (_, i) => DETAIL_FIRST + i), 120, 199];

export interface ProviderDeps {
  loadFeed: (name: FeedName) => Promise<FeedResult>;
  now: () => number;
  /** How long a loaded feed is reused, in milliseconds. */
  cacheMs?: number;
}

/**
 * Pages are built lazily: 100 needs no network, 101, 110 to 119 and 120 need the day feed,
 * 102 needs the week feed and 199 uses whatever feeds are already loaded.
 */
export function createProvider(deps: ProviderDeps): PageProvider {
  const cacheMs = deps.cacheMs ?? 60_000;
  const cache = new Map<FeedName, { at: number; promise: Promise<FeedResult> }>();

  const feed = (name: FeedName): Promise<FeedResult> => {
    const hit = cache.get(name);
    if (hit && deps.now() - hit.at < cacheMs) return hit.promise;
    const promise = deps.loadFeed(name);
    cache.set(name, { at: deps.now(), promise });
    promise.catch(() => cache.delete(name)); // failures are never cached
    return promise;
  };
  const loaded = async (name: FeedName): Promise<number | null> => {
    const hit = cache.get(name);
    if (!hit) return null;
    try {
      return (await hit.promise).generated;
    } catch {
      return null;
    }
  };

  const wrap = (subpages: ProvidedPage['subpages']): ProvidedPage => ({ subpages, fastext: FASTEXT });

  return async (n) => {
    if (n === 100) return wrap([buildIndexPage()]);
    if (n === 101) {
      const day = await feed('day');
      const newestFirst = [...day.features].sort((a, b) => b.time - a.time);
      return wrap(buildListSubpages(101, 'Past day M4.5+', newestFirst, 'No earthquakes of magnitude 4.5 or more in the past day.'));
    }
    if (n === 102) {
      const week = await feed('week');
      const newestFirst = [...week.features].sort((a, b) => b.time - a.time);
      return wrap(buildListSubpages(102, 'Significant week', newestFirst, 'No significant earthquakes this week.'));
    }
    if (n >= DETAIL_FIRST && n < DETAIL_FIRST + DETAIL_COUNT) {
      const day = await feed('day');
      const top = strongest(day.features);
      const q = top[n - DETAIL_FIRST];
      return q ? wrap([buildDetailPage(n, q, n - DETAIL_FIRST + 1, deps.now())]) : null;
    }
    if (n === 120) return wrap([buildHistogramPage((await feed('day')).features)]);
    if (n === 199) return wrap([buildAboutPage(await loaded('day'), await loaded('week'))]);
    return null;
  };
}

export { FeedError, FEED_URLS };
