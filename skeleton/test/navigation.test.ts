import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { nextPageNumber, prevPageNumber, neighbourPage, enterDigit, type DigitState } from '../src/store.js';

const pageNumber = fc.integer({ min: 100, max: 899 });

describe('page number navigation (REQ-5.1)', () => {
  it('wraps at both ends', () => {
    expect(nextPageNumber(899)).toBe(100);
    expect(prevPageNumber(100)).toBe(899);
    expect(nextPageNumber(100)).toBe(101);
  });

  it('[PBT REQ-5.1.2] next and previous stay in 100 to 899', () => {
    fc.assert(
      fc.property(pageNumber, (n) => {
        expect(nextPageNumber(n)).toBeGreaterThanOrEqual(100);
        expect(nextPageNumber(n)).toBeLessThanOrEqual(899);
        expect(prevPageNumber(n)).toBeGreaterThanOrEqual(100);
        expect(prevPageNumber(n)).toBeLessThanOrEqual(899);
      }),
    );
  });

  it('[PBT REQ-5.1.3] next and previous are inverses', () => {
    fc.assert(
      fc.property(pageNumber, (n) => {
        expect(prevPageNumber(nextPageNumber(n))).toBe(n);
        expect(nextPageNumber(prevPageNumber(n))).toBe(n);
      }),
    );
  });

  it('[PBT REQ-5.1.4] 799 steps forward visit every page number exactly once', () => {
    fc.assert(
      fc.property(pageNumber, (start) => {
        const seen = new Set<number>();
        let n = start;
        for (let i = 0; i < 800; i++) {
          seen.add(n);
          n = nextPageNumber(n);
        }
        expect(seen.size).toBe(800);
        expect(n).toBe(start);
      }),
      { numRuns: 20 },
    );
  });

  it('rejects numbers outside 100 to 899', () => {
    expect(() => nextPageNumber(99)).toThrow(RangeError);
    expect(() => prevPageNumber(900)).toThrow(RangeError);
  });

  it('[PBT REQ-5.1.5] with a list of available pages the neighbour is always one of them and moving back returns', () => {
    fc.assert(
      fc.property(fc.uniqueArray(pageNumber, { minLength: 1, maxLength: 12 }), fc.nat(), (pages, pick) => {
        const from = pages[pick % pages.length] as number;
        const fwd = neighbourPage(from, 1, pages);
        const back = neighbourPage(from, -1, pages);
        expect(pages).toContain(fwd);
        expect(pages).toContain(back);
        expect(neighbourPage(fwd, -1, pages)).toBe(from);
        expect(neighbourPage(back, 1, pages)).toBe(from);
      }),
    );
  });
});

describe('digit entry (REQ-5.2)', () => {
  const feed = (digits: number[]) => {
    let state: DigitState = { digits: '' };
    const navigations: number[] = [];
    for (const d of digits) {
      const r = enterDigit(state, d);
      state = r.next;
      if (r.navigate !== null) navigations.push(r.navigate);
    }
    return { state, navigations };
  };

  it('[PBT REQ-5.2.4] any digit stream only ever navigates to pages from 100 to 899', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 9 }), { maxLength: 60 }), (digits) => {
        const { navigations } = feed(digits);
        for (const n of navigations) {
          expect(n).toBeGreaterThanOrEqual(100);
          expect(n).toBeLessThanOrEqual(899);
        }
      }),
    );
  });

  it('typing 4 0 1 gives 401 and a leading 0 or 9 is rejected', () => {
    expect(feed([4, 0, 1]).navigations).toEqual([401]);
    expect(feed([0, 9, 1, 0, 5]).navigations).toEqual([105]);
  });
});
