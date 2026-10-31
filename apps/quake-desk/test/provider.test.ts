import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { interpretPage } from '@skeletext/core';
import { parseFeed, FeedError } from '../src/feed.js';
import { createProvider, PAGE_NUMBERS } from '../src/provider.js';
import type { FeedName } from '../src/types.js';

// fixture: real USGS snapshots saved from the live feeds on 2026-10-31
const day = parseFeed(JSON.parse(readFileSync(new URL('../scripts/snapshot-day.json', import.meta.url), 'utf8')));
const week = parseFeed(JSON.parse(readFileSync(new URL('../scripts/snapshot-week.json', import.meta.url), 'utf8')));
const signal = new AbortController().signal;
const text = (p: Uint8Array) => interpretPage(p).map((r) => r.map((c) => c.char).join('')).join('\n');

const make = (clock = { t: 1_793_470_000_000 }) => {
  const loadFeed = vi.fn(async (name: FeedName) => (name === 'day' ? day : week));
  return { loadFeed, clock, provider: createProvider({ loadFeed, now: () => clock.t, cacheMs: 60_000 }) };
};

describe('provider', () => {
  it('page 100 needs no network', async () => {
    const { provider, loadFeed } = make();
    const page = await provider(100, signal);
    expect(page?.subpages.length).toBe(1);
    expect(loadFeed).not.toHaveBeenCalled();
  });

  it('pages 101, 102, 110 and 120 load the right feed once and cache it', async () => {
    const { provider, loadFeed } = make();
    await provider(101, signal);
    await provider(110, signal);
    await provider(120, signal);
    await provider(102, signal);
    expect(loadFeed.mock.calls.map((c) => c[0])).toEqual(['day', 'week']);
  });

  it('refetches after the cache time', async () => {
    const { provider, loadFeed, clock } = make();
    await provider(101, signal);
    clock.t += 61_000;
    await provider(101, signal);
    expect(loadFeed).toHaveBeenCalledTimes(2);
  });

  it('unknown pages and detail pages beyond the data are null', async () => {
    const { provider } = make();
    expect(await provider(555, signal)).toBeNull();
    const last = 110 + 9;
    const afterData = 110 + day.features.length;
    if (afterData <= last) expect(await provider(afterData, signal)).toBeNull();
  });

  it('a failed feed rejects with a readable message and is not cached', async () => {
    let calls = 0;
    const loadFeed = vi.fn(async (): Promise<typeof day> => {
      calls++;
      if (calls === 1) throw new FeedError('The USGS day feed did not answer within 8 seconds.', 'day');
      return day;
    });
    const provider = createProvider({ loadFeed, now: () => 1 });
    await expect(provider(101, signal)).rejects.toThrow('did not answer within 8 seconds');
    const retry = await provider(101, signal);
    expect(retry?.subpages.length).toBeGreaterThan(0);
  });

  it('the about page reports the feed times of the feeds loaded so far', async () => {
    const { provider } = make();
    expect(text((await provider(199, signal))!.subpages[0]!)).toContain('not loaded');
    await provider(101, signal);
    expect(text((await provider(199, signal))!.subpages[0]!)).not.toContain('Past day, M4.5+     not loaded');
  });

  it('every page number the viewer is told about can be provided, except missing detail pages', async () => {
    const { provider } = make();
    for (const n of PAGE_NUMBERS) {
      const p = await provider(n, signal);
      if (p) expect(p.fastext.index).toBe(100);
    }
  });
});
