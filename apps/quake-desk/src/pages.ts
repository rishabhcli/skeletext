import { PageBuilder, wrapText, type FastextConfig, type FastextLabels, type RawPage } from '@skeletext/core';
import type { QuakeFeature } from './types.js';
import { magnitudeColour } from './colour.js';
import { ago, coords, hhmm, stamp } from './format.js';

export const SERVICE = 'QUAKE DESK';
export const DETAIL_FIRST = 110;
export const DETAIL_COUNT = 10;
export const ROWS_PER_SUBPAGE = 10;

export const FASTEXT: FastextConfig = { red: 100, green: 101, yellow: 120, cyan: 199, index: 100 };
export const LABELS: FastextLabels = { red: 'Index', green: 'Day M4.5+', yellow: 'Chart', cyan: 'About' };

const base = (n: number, title: string) => new PageBuilder().header(n, SERVICE).title(title);
const finish = (b: PageBuilder): RawPage => b.prompt(FASTEXT, LABELS).build();

export function buildIndexPage(): RawPage {
  const b = base(100, 'Earthquakes');
  b.heading(4, 'Live from the USGS public feeds');
  const items: Array<[string, string]> = [
    ['Past day, magnitude 4.5 and up', '101'],
    ['Significant this week', '102'],
    ['The ten strongest, in detail', '110'],
    ['Magnitude chart', '120'],
    ['About this service', '199'],
  ];
  items.forEach(([label, page], i) => b.listRow(6 + i, label, page));
  b.text(13, 0, 'Type three digits for a page, or use the', { fg: 2 });
  b.text(14, 0, 'coloured keys. Arrow keys turn the page.', { fg: 2 });
  b.text(16, 0, 'Red, yellow and white mean quake strength:', { fg: 5 });
  b.text(17, 0, 'white under 5, yellow 5 to 6, red above 6.', { fg: 5 });
  return finish(b);
}

function listRows(b: PageBuilder, quakes: QuakeFeature[]): void {
  b.text(3, 0, 'UTC    Mag  Place', { fg: 3 });
  quakes.forEach((q, i) => {
    const row = 4 + i;
    b.text(row, 0, hhmm(q.time), { fg: 2 });
    b.text(row, 7, q.mag.toFixed(1), { fg: magnitudeColour(q.mag) });
    b.text(row, 13, q.place, { fg: 7 });
  });
}

/** Pages 101 and 102: a list over one or more subpages of ten rows. Returns at least one subpage. */
export function buildListSubpages(pageNumber: number, title: string, quakes: QuakeFeature[], emptyMessage: string): RawPage[] {
  if (quakes.length === 0) {
    const b = base(pageNumber, title);
    b.text(5, 0, emptyMessage, { fg: 7 });
    return [finish(b)];
  }
  const out: RawPage[] = [];
  for (let start = 0; start < quakes.length; start += ROWS_PER_SUBPAGE) {
    const b = base(pageNumber, title);
    listRows(b, quakes.slice(start, start + ROWS_PER_SUBPAGE));
    b.text(20, 0, `${quakes.length} earthquakes, newest first`, { fg: 5 });
    b.text(21, 0, 'Source: earthquake.usgs.gov', { fg: 5 });
    out.push(finish(b));
  }
  return out;
}

/** The strongest quakes, strongest first, at most ten. */
export function strongest(quakes: QuakeFeature[]): QuakeFeature[] {
  return [...quakes].sort((a, b) => b.mag - a.mag || b.time - a.time).slice(0, DETAIL_COUNT);
}

/** Pages 110 to 119: one quake in detail. */
export function buildDetailPage(pageNumber: number, q: QuakeFeature, rank: number, now: number): RawPage {
  const colour = magnitudeColour(q.mag);
  const b = base(pageNumber, `Magnitude ${q.mag.toFixed(1)}`);
  wrapText(q.place, 36)
    .slice(0, 2)
    .forEach((line, i) => b.text(4 + i, 0, line, { fg: colour }));
  b.listRow(7, 'Depth', `${q.depth.toFixed(0)} km`);
  b.listRow(8, 'Position', coords(q.lat, q.lon));
  b.listRow(9, 'Time (UTC)', stamp(q.time));
  b.listRow(10, 'Happened', ago(q.time, now));
  b.listRow(11, 'Felt reports', q.felt === null ? 'none' : String(q.felt));
  b.listRow(12, 'Tsunami flag', q.tsunami ? 'YES' : 'no', q.tsunami ? 1 : 7);
  b.listRow(13, 'Alert level', q.alert ?? 'none', q.alert ? 1 : 7);
  b.listRow(14, 'Event id', q.id);
  b.heading(16, 'Magnitude on a scale of 0 to 9');
  b.mosaicBar(17, 0, 30, q.mag / 9, colour);
  b.text(17, 33, q.mag.toFixed(1), { fg: colour });
  b.text(19, 0, `Rank ${rank} of today's strongest`, { fg: 5 });
  b.text(20, 0, 'Source: earthquake.usgs.gov', { fg: 5 });
  return finish(b);
}

export const HISTOGRAM_BINS: ReadonlyArray<{ label: string; from: number; to: number }> = [
  { label: '4.5-4.9', from: 4.5, to: 5 },
  { label: '5.0-5.4', from: 5, to: 5.5 },
  { label: '5.5-5.9', from: 5.5, to: 6 },
  { label: '6.0-6.4', from: 6, to: 6.5 },
  { label: '6.5-6.9', from: 6.5, to: 7 },
  { label: '7.0 up', from: 7, to: Infinity },
];

export function histogramCounts(quakes: QuakeFeature[]): number[] {
  return HISTOGRAM_BINS.map((bin) => quakes.filter((q) => q.mag >= bin.from && q.mag < bin.to).length);
}

/** Page 120. */
export function buildHistogramPage(quakes: QuakeFeature[]): RawPage {
  const b = base(120, 'Magnitude chart');
  b.heading(4, `Past day: ${quakes.length} earthquakes`);
  const counts = histogramCounts(quakes);
  const max = Math.max(1, ...counts);
  HISTOGRAM_BINS.forEach((bin, i) => {
    const row = 6 + i * 2;
    const count = counts[i] ?? 0;
    b.text(row, 0, bin.label, { fg: 2 });
    b.mosaicBar(row, 9, 24, count / max, magnitudeColour(bin.from));
    b.text(row, 35, String(count), { fg: 7 });
  });
  b.text(19, 0, 'Bars are scaled to the busiest bin.', { fg: 5 });
  b.text(20, 0, 'Source: earthquake.usgs.gov', { fg: 5 });
  return finish(b);
}

/** Page 199. */
export function buildAboutPage(dayGenerated: number | null, weekGenerated: number | null): RawPage {
  const b = base(199, 'About');
  [
    'Quake Desk shows live earthquake data from',
    'the US Geological Survey as teletext pages.',
  ].forEach((l, i) => b.text(4 + i, 0, l, { fg: 7 }));
  b.heading(7, 'Feeds');
  b.listRow(8, 'Past day, M4.5+', dayGenerated === null ? 'not loaded' : stamp(dayGenerated));
  b.listRow(9, 'Significant, week', weekGenerated === null ? 'not loaded' : stamp(weekGenerated));
  b.text(10, 0, 'Times are the feed generation times, UTC.', { fg: 5 });
  b.heading(12, 'Teletext');
  [
    'A 40 by 24 grid of cells, colour codes that',
    'take a cell each, block graphics, and pages',
    'numbered 100 to 899. Ceefax ended in 2012.',
  ].forEach((l, i) => b.text(13 + i, 0, l, { fg: 7 }));
  b.text(17, 0, 'Press x to reveal hidden text on a page.', { fg: 2 });
  b.text(19, 0, 'Built on skeletext, MIT licensed:', { fg: 3 });
  b.text(20, 0, 'github.com/rishabhcli/skeletext', { fg: 6 });
  return finish(b);
}
