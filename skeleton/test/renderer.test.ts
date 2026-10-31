import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createPage, setCell } from '../src/grid.js';
import { interpretPage } from '../src/interpreter.js';
import { renderSVG, escapeXml, SVG_W, SVG_H, PALETTE } from '../src/renderer.js';
import { encodeBlockMask } from '../src/mosaic.js';
import type { RawPage } from '../src/types.js';

const draw = (page: RawPage, reveal = false) => renderSVG(interpretPage(page, reveal));

function put(page: RawPage, row: number, col: number, text: string | number[]) {
  const bytes = typeof text === 'string' ? Array.from(text).map((c) => c.charCodeAt(0)) : text;
  bytes.forEach((b, i) => setCell(page, row, col + i, b));
}

const popcount = (n: number) => n.toString(2).replace(/0/g, '').length;
const anyPage = fc.uint8Array({ minLength: 960, maxLength: 960 }).map((a) => a.map((x) => x & 0x7f) as RawPage);

describe('REQ-8 SVG renderer', () => {
  it('produces one svg document of the fixed size', () => {
    const svg = draw(createPage());
    expect(svg.startsWith('<svg ')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain(`viewBox="0 0 ${SVG_W} ${SVG_H}"`);
  });

  it('[PBT REQ-8.2] the same input always gives the same output', () => {
    fc.assert(
      fc.property(anyPage, (page) => {
        expect(draw(page)).toBe(draw(page.slice() as RawPage));
      }),
      { numRuns: 50 },
    );
  });

  it('[PBT REQ-8.1] text from the page can never inject markup', () => {
    fc.assert(
      fc.property(fc.string({ unit: fc.constantFrom('<', '>', '&', '"', "'", 'a', 'Z', ' ', '/', '=') , minLength: 1, maxLength: 39 }), (text) => {
        const page = createPage();
        put(page, 5, 0, text);
        const svg = draw(page);
        // Remove every legitimate tag, nothing that looks like markup may be left behind.
        const withoutTags = svg.replace(/<\/?[a-zA-Z][^<>]*>/g, '');
        expect(withoutTags).not.toMatch(/[<>]/);
        expect(withoutTags).not.toMatch(/&(?!amp;|lt;|gt;|quot;|#39;)/);
      }),
      { numRuns: 200 },
    );
  });

  it('escapeXml handles all five characters', () => {
    expect(escapeXml(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  });

  it('draws a background rect even on an all-space page, one per row of equal colour', () => {
    const svg = draw(createPage());
    const bgRects = svg.match(/<g class="bg"[^>]*>(.*?)<\/g>/)?.[1]?.match(/<rect /g) ?? [];
    expect(bgRects.length).toBe(24);
    expect(svg).not.toContain('<text');
  });

  it('[PBT REQ-8.5] a mosaic cell draws exactly one rect per set block, in the foreground colour', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 63 }), fc.integer({ min: 0x11, max: 0x17 }), fc.boolean(), (mask, code, separated) => {
        const page = createPage();
        put(page, 3, 4, [code, ...(separated ? [0x1a] : []), encodeBlockMask(mask)]);
        const svg = draw(page);
        const rects = svg.match(/<rect class="m"[^>]*>/g) ?? [];
        expect(rects.length).toBe(popcount(mask));
        for (const r of rects) expect(r).toContain(`fill="${PALETTE[code - 0x10]}"`);
        expect(svg).not.toContain('<text');
      }),
    );
  });

  it('separated mosaic blocks are drawn smaller than contiguous ones', () => {
    const area = (separated: boolean) => {
      const page = createPage();
      put(page, 0, 0, [0x11, ...(separated ? [0x1a] : []), encodeBlockMask(63)]);
      const rect = draw(page).match(/<rect class="m"[^>]*>/)?.[0] ?? '';
      return Number(/width="(\d+)"/.exec(rect)?.[1]) * Number(/height="(\d+)"/.exec(rect)?.[1]);
    };
    expect(area(true)).toBeLessThan(area(false));
  });

  it('double-height text is stretched and the lower row only has background', () => {
    const page = createPage();
    put(page, 1, 0, [0x0d, 0x41]);
    const svg = draw(page);
    expect(svg).toContain('scale(1 2)');
    expect(svg.match(/<text/g)?.length).toBe(1);
  });

  it('flashing cells are wrapped in a flash group, steady ones are not', () => {
    const page = createPage();
    put(page, 0, 0, [0x08, 0x41, 0x09, 0x42]);
    const svg = draw(page);
    expect(svg.match(/<g class="flash">/g)?.length).toBe(1);
  });

  it('concealed text is not drawn until revealed', () => {
    const page = createPage();
    put(page, 0, 0, [0x18, 0x48, 0x49]);
    expect(draw(page, false)).not.toContain('<text');
    expect(draw(page, true).match(/<text/g)?.length).toBe(2);
  });

  it('[PBT REQ-8.7] every drawn text element is closed and every colour is from the palette', () => {
    fc.assert(
      fc.property(anyPage, (page) => {
        const svg = draw(page, true);
        expect((svg.match(/<text /g) ?? []).length).toBe((svg.match(/<\/text>/g) ?? []).length);
        for (const m of svg.matchAll(/fill="(#[0-9a-f]{6})"/g)) expect(PALETTE).toContain(m[1]);
      }),
      { numRuns: 50 },
    );
  });
});
