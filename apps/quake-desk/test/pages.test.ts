import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { interpretPage, type RawPage, type DisplayCell } from '@skeletext/core';
import { parseFeed } from '../src/feed.js';
import type { QuakeFeature } from '../src/types.js';
import { buildAboutPage, buildDetailPage, buildHistogramPage, buildIndexPage, buildListSubpages, histogramCounts, strongest, ROWS_PER_SUBPAGE } from '../src/pages.js';

// fixture: a real USGS snapshot saved from the live feed on 2026-10-31
const real = parseFeed(JSON.parse(readFileSync(new URL('../scripts/snapshot-day.json', import.meta.url), 'utf8'))).features;
const NOW = 1_793_470_000_000;

const text = (page: RawPage, reveal = false) => interpretPage(page, reveal).map((r) => r.map((c: DisplayCell) => c.char).join(''));
const quake = fc.record({
  id: fc.string({ minLength: 1, maxLength: 12 }),
  mag: fc.double({ min: 4.5, max: 9.5, noNaN: true }),
  place: fc.string({ minLength: 1, maxLength: 80 }),
  time: fc.integer({ min: 1_700_000_000_000, max: 1_800_000_000_000 }),
  url: fc.constant('https://earthquake.usgs.gov/x'),
  felt: fc.option(fc.integer({ min: 0, max: 5000 }), { nil: null }),
  alert: fc.option(fc.constantFrom('green', 'yellow', 'orange', 'red'), { nil: null }),
  tsunami: fc.boolean(),
  sig: fc.integer({ min: 0, max: 2000 }),
  lon: fc.double({ min: -180, max: 180, noNaN: true }),
  lat: fc.double({ min: -90, max: 90, noNaN: true }),
  depth: fc.double({ min: 0, max: 700, noNaN: true }),
}) as fc.Arbitrary<QuakeFeature>;

const valid = (p: RawPage) => p.length === 960 && p.every((b) => b <= 0x7f);
const promptRowHasFourLinks = (p: RawPage) => {
  const row = Array.from(p.slice(23 * 40, 24 * 40));
  return row.filter((b) => b < 0x20).join(',') === '1,2,3,6';
};

describe('page builders', () => {
  it('real data gives sensible pages', () => {
    expect(real.length).toBeGreaterThan(0);
    const top = strongest(real);
    const detail = text(buildDetailPage(110, top[0]!, 1, NOW)).join('\n');
    expect(detail).toContain(`Magnitude ${top[0]!.mag.toFixed(1)}`);
    expect(detail).toContain('Depth');
    expect(text(buildIndexPage()).join('\n')).toContain('Magnitude chart');
    expect(text(buildAboutPage(NOW, null)).join('\n')).toContain('not loaded');
  });

  it('[PBT REQ-5.1] list subpages: ceil(n / 10) subpages, every quake listed once, all pages valid with the four Fastext links', () => {
    fc.assert(
      fc.property(fc.array(quake, { maxLength: 45 }), (quakes) => {
        const pages = buildListSubpages(101, 'Past day M4.5+', quakes, 'none');
        expect(pages.length).toBe(Math.max(1, Math.ceil(quakes.length / ROWS_PER_SUBPAGE)));
        for (const p of pages) {
          expect(valid(p)).toBe(true);
          expect(promptRowHasFourLinks(p)).toBe(true);
        }
        const body = pages.flatMap((p) => text(p).slice(4, 14)).filter((l) => l.trim() !== '');
        if (quakes.length > 0) expect(body.length).toBe(quakes.length);
        else expect(body.length).toBe(1); // the empty message
      }),
      { numRuns: 60 },
    );
  });

  it('[PBT REQ-7.1] a detail page is always valid, shows the magnitude, and never writes on row 23 except the prompt row', () => {
    fc.assert(
      fc.property(quake, fc.integer({ min: 110, max: 119 }), (q, n) => {
        const page = buildDetailPage(n, q, n - 109, NOW);
        expect(valid(page)).toBe(true);
        expect(promptRowHasFourLinks(page)).toBe(true);
        expect(text(page).join('\n')).toContain(`Magnitude ${q.mag.toFixed(1)}`);
        expect(text(page)[23]).toContain('Index');
        expect(text(page).slice(0, 23).join('').includes('Index')).toBe(false);
      }),
      { numRuns: 80 },
    );
  });

  it('[PBT REQ-8.1] histogram bins add up to the number of quakes of magnitude 4.5 and above', () => {
    fc.assert(
      fc.property(fc.array(quake, { maxLength: 60 }), (quakes) => {
        expect(histogramCounts(quakes).reduce((a, b) => a + b, 0)).toBe(quakes.length);
        expect(valid(buildHistogramPage(quakes))).toBe(true);
      }),
      { numRuns: 60 },
    );
  });

  it('[PBT REQ-8.2] the busiest bin has the longest bar', () => {
    fc.assert(
      fc.property(fc.array(quake, { minLength: 1, maxLength: 60 }), (quakes) => {
        const counts = histogramCounts(quakes);
        const cells = interpretPage(buildHistogramPage(quakes));
        const bar = (i: number) => cells[6 + i * 2]!.reduce((n, c) => n + (c.charMode === 'mosaic' ? c.mosaicMask.toString(2).replace(/0/g, '').length : 0), 0);
        const best = counts.indexOf(Math.max(...counts));
        for (let i = 0; i < counts.length; i++) expect(bar(i)).toBeLessThanOrEqual(bar(best));
      }),
      { numRuns: 60 },
    );
  });

  it('strongest picks at most ten, in falling magnitude', () => {
    fc.assert(
      fc.property(fc.array(quake, { maxLength: 40 }), (quakes) => {
        const top = strongest(quakes);
        expect(top.length).toBeLessThanOrEqual(10);
        for (let i = 1; i < top.length; i++) expect(top[i - 1]!.mag).toBeGreaterThanOrEqual(top[i]!.mag);
      }),
    );
  });

  it('a long place name is cut with a visible marker instead of wrapping', () => {
    const q = { ...real[0]!, place: 'x'.repeat(200) };
    const row = text(buildListSubpages(101, 't', [q], '')[0]!)[4]!;
    expect(row.endsWith('>')).toBe(true);
    expect(row.length).toBe(40);
  });
});
