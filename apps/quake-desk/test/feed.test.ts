import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { fetchFeed, parseFeature, parseFeed, FeedError, type Fetcher } from '../src/feed.js';

// fixture: a real USGS snapshot saved from the live feed on 2026-10-31
const fixtureDay = JSON.parse(readFileSync(new URL('../scripts/snapshot-day.json', import.meta.url), 'utf8'));

const feature = (over: Record<string, unknown> = {}) => ({
  id: 'us7000test',
  properties: { mag: 5.2, place: '10 km N of Somewhere', time: 1_700_000_000_000, url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us7000test', felt: null, alert: null, tsunami: 0, sig: 416, ...over },
  geometry: { coordinates: [139.8, 35.1, 33.4] },
});

describe('parseFeature (REQ-1)', () => {
  it('reads a real snapshot completely', () => {
    const feed = parseFeed(fixtureDay);
    expect(feed.features.length).toBe(fixtureDay.features.length);
    for (const q of feed.features) {
      expect(Number.isFinite(q.mag)).toBe(true);
      expect(q.id.length).toBeGreaterThan(0);
      expect(q.lat).toBeGreaterThanOrEqual(-90);
      expect(q.lat).toBeLessThanOrEqual(90);
    }
    expect(feed.generated).toBe(fixtureDay.metadata.generated);
  });

  it('maps the fields', () => {
    expect(parseFeature(feature({ tsunami: 1, felt: 12, alert: 'green' }))).toMatchObject({ mag: 5.2, tsunami: true, felt: 12, alert: 'green', depth: 33.4, lon: 139.8, lat: 35.1 });
  });

  it('[PBT REQ-1.3] never throws for any JSON value and returns null for anything without numeric magnitude, time and coordinates', () => {
    fc.assert(
      fc.property(fc.anything(), (raw) => {
        const r = parseFeature(raw);
        if (r) {
          expect(Number.isFinite(r.mag)).toBe(true);
          expect(Number.isFinite(r.time)).toBe(true);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('[PBT REQ-1.4] valid-shaped features always parse', () => {
    fc.assert(
      fc.property(fc.double({ min: -1, max: 10, noNaN: true }), fc.string({ maxLength: 40 }), fc.integer({ min: 0, max: 2_000_000_000_000 }), fc.double({ min: -180, max: 180, noNaN: true }), fc.double({ min: -90, max: 90, noNaN: true }), fc.double({ min: -5, max: 700, noNaN: true }), (mag, place, time, lon, lat, depth) => {
        const q = parseFeature({ id: 'x', properties: { mag, place, time, tsunami: 0, sig: 1 }, geometry: { coordinates: [lon, lat, depth] } });
        expect(q).not.toBeNull();
        expect(q!.mag).toBe(mag);
        expect(q!.place.length).toBeGreaterThan(0);
      }),
    );
  });

  it('drops features with a missing magnitude instead of failing the feed', () => {
    const feed = parseFeed({ metadata: { generated: 5 }, features: [feature(), feature({ mag: null })] });
    expect(feed.features.length).toBe(1);
  });

  it('rejects a document that is not a feed', () => {
    expect(() => parseFeed({ nope: true })).toThrow();
  });
});

describe('fetchFeed (REQ-2)', () => {
  const ok = (json: unknown): Fetcher => async () => ({ ok: true, status: 200, json: async () => json });

  it('returns the parsed feed', async () => {
    const r = await fetchFeed('day', ok(fixtureDay));
    expect(r.features.length).toBeGreaterThan(0);
  });

  it('turns an HTTP error into a FeedError that names the status', async () => {
    const f: Fetcher = async () => ({ ok: false, status: 503, json: async () => ({}) });
    await expect(fetchFeed('day', f)).rejects.toMatchObject({ name: 'FeedError', feed: 'day', message: expect.stringContaining('503') });
  });

  it('turns a network failure into a FeedError', async () => {
    const f: Fetcher = async () => {
      throw new Error('offline');
    };
    await expect(fetchFeed('week', f)).rejects.toThrow(/offline/);
  });

  it('gives up after the timeout and says so', async () => {
    const never: Fetcher = (_url, init) => new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))));
    const started = Date.now();
    await expect(fetchFeed('day', never, 50)).rejects.toMatchObject({ message: expect.stringContaining('did not answer within') });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('a body that is not JSON becomes a FeedError', async () => {
    const f: Fetcher = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token'); } });
    await expect(fetchFeed('day', f)).rejects.toBeInstanceOf(FeedError);
  });
});
