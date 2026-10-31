import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { mapKey, reduce, initialState, startCarousel, decorate, screenPage, indexPageOf, type ViewerEvent, type ViewerState, type ProvidedPage } from '../src/viewer.js';
import { createPage, getCell } from '../src/grid.js';
import { interpretPage } from '../src/interpreter.js';

const provided = (n = 2): ProvidedPage => ({
  subpages: Array.from({ length: n }, () => createPage()),
  fastext: { red: 100, green: 110, yellow: 140, cyan: 150, index: 100 },
});

describe('REQ-9.3 mapKey', () => {
  it('maps digits, colour keys, navigation and reveal', () => {
    expect(mapKey('7')).toEqual({ type: 'digit', value: 7 });
    expect(mapKey('r')).toEqual({ type: 'fastext', key: 'red' });
    expect(mapKey('G')).toEqual({ type: 'fastext', key: 'green' });
    expect(mapKey('y')).toEqual({ type: 'fastext', key: 'yellow' });
    expect(mapKey('c')).toEqual({ type: 'fastext', key: 'cyan' });
    expect(mapKey('i')).toEqual({ type: 'fastext', key: 'index' });
    expect(mapKey('ArrowRight')).toEqual({ type: 'next' });
    expect(mapKey('ArrowLeft')).toEqual({ type: 'prev' });
    expect(mapKey('x')).toEqual({ type: 'reveal' });
    expect(mapKey('Escape')).toEqual({ type: 'cancel-entry' });
  });

  it('[PBT REQ-9.3] keys that are not mapped return null and every digit maps to its value', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 3 }), (k) => {
        const a = mapKey(k);
        if (/^[0-9]$/.test(k)) expect(a).toEqual({ type: 'digit', value: Number(k) });
        if (a === null) expect(['r', 'g', 'y', 'c', 'i', 'x']).not.toContain(k.toLowerCase());
      }),
    );
  });
});

describe('REQ-9.2 startCarousel', () => {
  it('calls onTick once per interval and stops when asked', () => {
    vi.useFakeTimers();
    try {
      const onTick = vi.fn();
      const stop = startCarousel(8000, onTick);
      vi.advanceTimersByTime(8000 * 3);
      expect(onTick).toHaveBeenCalledTimes(3);
      stop();
      stop(); // stopping twice is harmless
      vi.advanceTimersByTime(8000 * 3);
      expect(onTick).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('REQ-11 viewer state machine', () => {
  const events: fc.Arbitrary<ViewerEvent> = fc.oneof(
    fc.record({ type: fc.constant('digit' as const), value: fc.integer({ min: 0, max: 9 }) }),
    fc.record({ type: fc.constant('fastext' as const), key: fc.constantFrom('red', 'green', 'yellow', 'cyan', 'index') as fc.Arbitrary<'red' | 'green' | 'yellow' | 'cyan' | 'index'> }),
    fc.constant({ type: 'next' as const }),
    fc.constant({ type: 'prev' as const }),
    fc.constant({ type: 'reveal' as const }),
    fc.constant({ type: 'cancel-entry' as const }),
    fc.constant({ type: 'tick' as const }),
    fc.record({ type: fc.constant('goto' as const), page: fc.integer({ min: -50, max: 1200 }) }),
    fc.record({ type: fc.constant('provided' as const), page: fc.integer({ min: 100, max: 899 }), result: fc.oneof(fc.constant(null), fc.constant(provided(1)), fc.constant(provided(3))) }),
    fc.record({ type: fc.constant('failed' as const), page: fc.integer({ min: 100, max: 899 }), message: fc.string({ maxLength: 50 }) }),
  );

  it('[PBT REQ-11.1] after any event sequence the state is exactly one of loading, page, not-found or error, and a request is only ever made for pages 100 to 899', () => {
    fc.assert(
      fc.property(fc.array(events, { maxLength: 60 }), (seq) => {
        let state: ViewerState = initialState(100);
        for (const e of seq) {
          const r = reduce(state, e, { pages: [100, 101, 110, 140, 150, 199] });
          state = r.state;
          expect(['loading', 'page', 'not-found', 'error']).toContain(state.status);
          if (r.request !== null) {
            expect(r.request).toBeGreaterThanOrEqual(100);
            expect(r.request).toBeLessThanOrEqual(899);
            expect(state.page).toBe(r.request);
            expect(state.status).toBe('loading');
          }
          expect(state.page).toBeGreaterThanOrEqual(100);
          expect(state.page).toBeLessThanOrEqual(899);
          if (state.status === 'page') expect(state.provided).not.toBeNull();
          else expect(state.provided).toBeNull();
          if (state.provided) expect(state.sub).toBeLessThan(state.provided.subpages.length);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('typing three digits requests that page, fewer digits do not', () => {
    let s = initialState(100);
    let r = reduce(s, { type: 'digit', value: 2 });
    expect(r.request).toBeNull();
    s = r.state;
    r = reduce(s, { type: 'digit', value: 0 });
    s = r.state;
    expect(r.request).toBeNull();
    r = reduce(s, { type: 'digit', value: 5 });
    expect(r.request).toBe(205);
    expect(r.state.digits.digits).toBe('');
  });

  it('a stale answer for another page is ignored', () => {
    const s = reduce(initialState(100), { type: 'goto', page: 120 }).state;
    const r = reduce(s, { type: 'provided', page: 100, result: provided() });
    expect(r.state.status).toBe('loading');
  });

  it('null becomes not-found, a rejection becomes error, and the red key then leads to the index page', () => {
    const base = reduce(initialState(100), { type: 'goto', page: 777 }).state;
    const nf = reduce(base, { type: 'provided', page: 777, result: null }).state;
    expect(nf.status).toBe('not-found');
    const er = reduce(base, { type: 'failed', page: 777, message: 'timeout' }).state;
    expect(er.status).toBe('error');
    expect(er.message).toBe('timeout');
    expect(reduce(nf, { type: 'fastext', key: 'red' }, { pages: [150, 101] }).request).toBe(101);
    expect(reduce(nf, { type: 'fastext', key: 'green' }).request).toBeNull();
  });

  it('[PBT REQ-11.2] the carousel index is always valid and repeats after a full cycle', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 12 }), fc.integer({ min: 0, max: 80 }), (count, ticks) => {
        let s: ViewerState = reduce(initialState(100), { type: 'provided', page: 100, result: provided(count) }).state;
        const start = s.sub;
        for (let i = 0; i < ticks; i++) {
          s = reduce(s, { type: 'tick' }).state;
          expect(s.sub).toBeGreaterThanOrEqual(0);
          expect(s.sub).toBeLessThan(count);
        }
        expect(s.sub).toBe((start + ticks) % count);
      }),
    );
  });

  it('next and previous follow the available pages with wrap', () => {
    const opts = { pages: [100, 120, 150] };
    const s = initialState(120);
    expect(reduce(s, { type: 'next' }, opts).request).toBe(150);
    expect(reduce(s, { type: 'prev' }, opts).request).toBe(100);
    expect(reduce(initialState(150), { type: 'next' }, opts).request).toBe(100);
  });

  it('reveal toggles and index page fallback is the lowest known page', () => {
    expect(reduce(initialState(100), { type: 'reveal' }).state.reveal).toBe(true);
    expect(indexPageOf({ pages: [300, 200] })).toBe(200);
    expect(indexPageOf({})).toBe(100);
  });
});

describe('REQ-11 live header decoration', () => {
  it('[PBT REQ-11.3] decoration never changes the size, keeps 7-bit bytes and does not touch rows 1 to 23', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 12 }), fc.integer({ min: 0, max: 5 }), fc.integer({ min: 1, max: 6 }), fc.string({ unit: fc.constantFrom('1', '2', '8', '0'), maxLength: 2 }), (clock, sub, count, digits) => {
        const page = createPage();
        for (let i = 40; i < 960; i++) page[i] = 0x41 + (i % 20);
        const out = decorate(page, { clock: clock.replace(/[^\x20-\x7e]/g, '?'), sub: Math.min(sub, count - 1), subCount: count, digits, pageNumber: 100 });
        expect(out.length).toBe(960);
        expect(out.every((b) => b <= 0x7f)).toBe(true);
        expect(Array.from(out.slice(40))).toEqual(Array.from(page.slice(40)));
        expect(page.slice(0, 40).every((b) => b === 0x20)).toBe(true); // input untouched
      }),
    );
  });

  it('shows the clock, the subpage indicator and typed digits on row 0', () => {
    const state = reduce(initialState(101), { type: 'provided', page: 101, result: provided(3) }).state;
    const withDigits = reduce(state, { type: 'digit', value: 4 }).state;
    const cells = interpretPage(screenPage(withDigits, '12:34:56'));
    const row = cells[0]!.map((c) => c.char).join('');
    expect(row).toContain('12:34:56');
    expect(row).toContain('1/3');
    expect(row).toContain('P4--');
    expect(getCell(createPage(), 0, 0)).toBe(0x20);
  });

  it('shows loading, not-found and error screens with the page number', () => {
    const text = (s: ViewerState) => interpretPage(screenPage(s, '00:00:00')).map((r) => r.map((c) => c.char).join('')).join('\n');
    const loading = initialState(321);
    expect(text(loading)).toContain('Fetching page 321');
    expect(text({ ...loading, status: 'not-found' })).toContain('Page 321 does not exist');
    expect(text({ ...loading, status: 'error', message: 'timeout after 8 s' })).toContain('timeout after 8 s');
  });
});
