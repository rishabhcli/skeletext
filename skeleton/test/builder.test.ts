import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { PageBuilder, wrapText, toAscii } from '../src/builder.js';
import { makeNotFoundPage, makeErrorPage, makeLoadingPage } from '../src/system-pages.js';
import { interpretPage } from '../src/interpreter.js';
import { getCell } from '../src/grid.js';
import type { Colour } from '../src/types.js';

const links = { red: 100, green: 101, yellow: 120, cyan: 199, index: 100 };
const labels = { red: 'Index', green: 'Today', yellow: 'Chart', cyan: 'About' };
const colour = fc.integer({ min: 0, max: 7 }) as fc.Arbitrary<Colour>;
const rowText = (cells: ReturnType<typeof interpretPage>, row: number) => cells[row]!.map((c) => c.char).join('');
const rowBytes = (p: Uint8Array, row: number) => Array.from(p.slice(row * 40, row * 40 + 40));

describe('REQ-10 PageBuilder', () => {
  it('[PBT REQ-10.1] any sequence of builder operations gives 960 seven-bit bytes and never touches row 23 with text', () => {
    const op = fc.oneof(
      fc.record({ kind: fc.constant('text' as const), row: fc.integer({ min: -2, max: 25 }), col: fc.integer({ min: -2, max: 45 }), s: fc.string({ maxLength: 60 }), fg: colour, bg: colour, flash: fc.boolean() }),
      fc.record({ kind: fc.constant('bar' as const), row: fc.integer({ min: -2, max: 25 }), col: fc.integer({ min: -2, max: 45 }), w: fc.integer({ min: -3, max: 60 }), f: fc.double({ noNaN: false }), c: colour }),
      fc.record({ kind: fc.constant('list' as const), row: fc.integer({ min: 3, max: 22 }), a: fc.string({ maxLength: 50 }), b: fc.string({ maxLength: 50 }) }),
      fc.record({ kind: fc.constant('title' as const), s: fc.string({ maxLength: 80 }) }),
      fc.record({ kind: fc.constant('header' as const), n: fc.integer({ min: 100, max: 899 }), s: fc.string({ maxLength: 40 }), clock: fc.string({ maxLength: 20 }) }),
    );
    fc.assert(
      fc.property(fc.array(op, { maxLength: 25 }), (ops) => {
        const b = new PageBuilder();
        for (const o of ops) {
          try {
            if (o.kind === 'text') b.text(o.row, o.col, o.s, { fg: o.fg, bg: o.bg, flash: o.flash });
            else if (o.kind === 'bar') b.mosaicBar(o.row, o.col, o.w, o.f, o.c);
            else if (o.kind === 'list') b.listRow(o.row, o.a, o.b);
            else if (o.kind === 'title') b.title(o.s);
            else b.header(o.n, o.s, o.clock);
          } catch (e) {
            expect(e).toBeInstanceOf(RangeError);
          }
        }
        const page = b.build();
        expect(page.length).toBe(960);
        expect(page.every((x) => x <= 0x7f)).toBe(true);
        expect(rowBytes(page, 23).every((x) => x === 0x20)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it('text cannot be written to row 23', () => {
    expect(() => new PageBuilder().text(23, 0, 'x')).toThrow(RangeError);
    expect(() => new PageBuilder().mosaicBar(23, 0, 5, 0.5, 2)).toThrow(RangeError);
  });

  it('[PBT REQ-10.2] text that does not fit is cut at column 39 and marked with >', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 37 }), fc.string({ unit: fc.constantFrom('a', 'b', ' '), minLength: 40, maxLength: 80 }), (col, s) => {
        const page = new PageBuilder().text(4, col, s).build();
        expect(getCell(page, 4, 39)).toBe(0x3e);
        const row = rowBytes(page, 4);
        expect(row.length).toBe(40);
      }),
    );
  });

  it('short text appears as written, after one colour code and one steady code, in the chosen colour', () => {
    const cells = interpretPage(new PageBuilder().text(6, 2, 'Hello', { fg: 3 }).build());
    expect(rowText(cells, 6).trim()).toBe('Hello');
    const h = cells[6]![4]!;
    expect(h).toMatchObject({ char: 'H', fg: 3, bg: 0, flash: false });
  });

  it('a background colour applies to the text and ends right after it', () => {
    const cells = interpretPage(new PageBuilder().text(6, 0, 'Bar', { fg: 1, bg: 7 }).build());
    const bar = cells[6]!.filter((c) => c.char !== ' ');
    expect(bar.map((c) => c.char).join('')).toBe('Bar');
    for (const c of bar) expect(c).toMatchObject({ fg: 1, bg: 7 });
    expect(cells[6]![39]!.bg).toBe(0);
  });

  it('[PBT REQ-10.3] mosaicBar fills monotonically with the fraction and never writes outside its width', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), fc.integer({ min: 1, max: 30 }), (a, b, width) => {
        const filled = (f: number) => {
          const cells = interpretPage(new PageBuilder().mosaicBar(5, 3, width, f, 2).build());
          return cells[5]!.reduce((n, c) => n + (c.charMode === 'mosaic' ? [1, 2, 4, 8, 16, 32].filter((bit) => (c.mosaicMask & bit) !== 0).length : 0), 0);
        };
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        expect(filled(lo)).toBeLessThanOrEqual(filled(hi));
        expect(filled(0)).toBe(0);
        expect(filled(1)).toBe(width * 6);
      }),
    );
  });

  it('the title is double height on row 1 and row 2 shows only background', () => {
    const cells = interpretPage(new PageBuilder().title('Earthquakes').build());
    expect(cells[1]!.some((c) => c.size === 'double-height-top' && c.char === 'E')).toBe(true);
    expect(cells[2]!.every((c) => c.char === ' ')).toBe(true);
  });

  it('listRow puts the value at the right edge', () => {
    const cells = interpretPage(new PageBuilder().listRow(7, 'Magnitude', '6.1').build());
    expect(rowText(cells, 7).trimEnd().endsWith('6.1')).toBe(true);
    expect(rowText(cells, 7)).toContain('Magnitude');
  });

  it('[PBT REQ-10.4] wrapText lines never exceed the width and rejoin to the original words', () => {
    fc.assert(
      fc.property(fc.string({ unit: fc.constantFrom('a', 'b', 'c', ' ', ' ', 'x'), maxLength: 200 }), fc.integer({ min: 1, max: 40 }), (s, width) => {
        const lines = wrapText(s, width);
        for (const l of lines) expect(l.length).toBeLessThanOrEqual(width);
        const original = s.split(/\s+/).filter(Boolean).join('');
        expect(lines.join('').replace(/\s+/g, '')).toBe(original);
      }),
    );
  });

  it('toAscii keeps ASCII, drops accents and replaces the rest', () => {
    expect(toAscii('Café Zürich')).toBe('Cafe Zurich');
    expect(toAscii('東京')).toBe('??');
  });

  it('build returns a copy', () => {
    const b = new PageBuilder().text(3, 0, 'a');
    const first = b.build();
    b.text(4, 0, 'b');
    expect(rowBytes(first, 4).every((x) => x === 0x20)).toBe(true);
  });
});

describe('REQ-12 system pages', () => {
  it('[PBT REQ-12.1] system pages are 960 bytes, seven bit, and row 23 holds only the prompt row', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 899 }), fc.string({ maxLength: 120 }), fc.string({ maxLength: 40 }), fc.boolean(), (n, msg, title, withLinks) => {
        const pages = [makeNotFoundPage(n, withLinks ? links : undefined), makeErrorPage(title, msg, withLinks ? links : undefined, n), makeLoadingPage(n)];
        for (const p of pages) {
          expect(p.length).toBe(960);
          expect(p.every((x) => x <= 0x7f)).toBe(true);
        }
        for (const p of pages.slice(0, 2)) {
          const row = rowBytes(p, 23);
          if (!withLinks) expect(row.every((x) => x === 0x20)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('not found page names the page', () => {
    const cells = interpretPage(makeNotFoundPage(456, links));
    expect(cells.map((r) => r.map((c) => c.char).join('')).join('\n')).toContain('Page 456 does not exist');
  });

  it('error page shows the title and the wrapped message in red', () => {
    const cells = interpretPage(makeErrorPage('Feed failed', 'The earthquake feed did not answer within 8 seconds.', links, 101));
    const text = cells.map((r) => r.map((c) => c.char).join('')).join('\n');
    expect(text).toContain('seconds');
    const msgCell = cells[5]!.find((c) => c.char === 'T');
    expect(msgCell?.fg).toBe(1);
  });
});
