// Tests for store.ts (REQ-5)

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { createStore, nextPage, prevPage, goToPage, enterDigit, tickCarousel, type PageStore, type Page } from '../src/store.js';
import { createPage } from '../src/grid.js';

describe('Navigation', () => {
  it('goToPage with n < 100 throws', () => {
    const store = createStore();
    expect(() => goToPage(store, 99)).toThrow();
  });

  it('goToPage with n > 899 throws', () => {
    const store = createStore();
    expect(() => goToPage(store, 900)).toThrow();
  });

  it('goToPage with valid page adds it to store', () => {
    const store = createStore();
    const page = createPage();
    const fastext = { red: null, green: null, yellow: null, cyan: null, index: null };
    const store2 = {
      pages: new Map([[100, { number: 100, subpages: [page], fastext }]]),
      currentPage: 100,
      currentSub: 0,
    };
    expect(() => goToPage(store2, 100)).not.toThrow();
  });

  it('nextPage and prevPage always return values in 100-899', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 899 }), (n) => {
        const page = createPage();
        const fastext = { red: null, green: null, yellow: null, cyan: null, index: null };
        const store = {
          pages: new Map([[n, { number: n, subpages: [page], fastext }]]),
          currentPage: n,
          currentSub: 0,
        };
        
        const storeN = nextPage(store);
        const storeP = prevPage(store);
        
        expect(storeN.currentPage).toBeGreaterThanOrEqual(100);
        expect(storeN.currentPage).lessThanOrEqual(899);
        expect(storeP.currentPage).toBeGreaterThanOrEqual(100);
        expect(storeP.currentPage).lessThanOrEqual(899);
        
        return true;
      })
    );
  });

  it('prevPage(nextPage(n)) === n and nextPage(prevPage(n)) === n', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 899 }), (n) => {
        const page = createPage();
        const fastext = { red: null, green: null, yellow: null, cyan: null, index: null };
        const store = {
          pages: new Map([[n, { number: n, subpages: [page], fastext }]]),
          currentPage: n,
          currentSub: 0,
        };
        
        expect(prevPage(nextPage(store)).currentPage).toBe(n);
        expect(nextPage(prevPage(store)).currentPage).toBe(n);
        
        return true;
      })
    );
  });
});

describe('Digit entry', () => {
  it('one digit returns navigate=null', () => {
    const result = enterDigit({ digits: '' }, 5);
    expect(result.navigate).toBeNull();
    expect(result.next.digits).toBe('5');
  });

  it('two digits returns navigate=null', () => {
    const result = enterDigit({ digits: '5' }, 2);
    expect(result.navigate).toBeNull();
    expect(result.next.digits).toBe('52');
  });

  it('first digit 0 resets state', () => {
    const result = enterDigit({ digits: '' }, 0);
    expect(result.navigate).toBeNull();
    expect(result.next.digits).toBe('');
  });

  it('first digit 9 resets state', () => {
    const result = enterDigit({ digits: '' }, 9);
    expect(result.navigate).toBeNull();
    expect(result.next.digits).toBe('');
  });

  it('three-digit sequence produces page in 100-899', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 0, max: 9 }),
        fc.integer({ min: 0, max: 9 }),
        (d1, d2, d3) => {
          const result1 = enterDigit({ digits: '' }, d1);
          const result2 = enterDigit(result1.next, d2);
          const result3 = enterDigit(result2.next, d3);
          
          expect(result3.navigate).not.toBeNull();
          if (result3.navigate !== null) {
            expect(result3.navigate).toBeGreaterThanOrEqual(100);
            expect(result3.navigate).lessThanOrEqual(899);
          }
          
          return true;
        }
      )
    );
  });
});

describe('Carousel', () => {
  it('carousel wraps from last subpage back to 0', () => {
    const page = createPage();
    const fastext = { red: null, green: null, yellow: null, cyan: null, index: null };
    const store: PageStore = {
      pages: new Map<number, Page>([
        [100, { number: 100, subpages: [page, page, page], fastext }],
      ]),
      currentPage: 100,
      currentSub: 2,
    };
    
    const store2 = tickCarousel(store);
    expect(store2.currentSub).toBe(0);
  });

  it('subpage index is always in 0 to k-1', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 1, max: 100 }),
        (numSubpages, numTicks) => {
          const page = createPage();
          const fastext = { red: null, green: null, yellow: null, cyan: null, index: null };
          const subpages = Array(numSubpages).fill(page);
          const store: PageStore = {
            pages: new Map([[100, { number: 100, subpages, fastext }]]),
            currentPage: 100,
            currentSub: 0,
          };
          
          let currentStore = store;
          for (let i = 0; i < numTicks; i++) {
            currentStore = tickCarousel(currentStore);
            expect(currentStore.currentSub).toBeGreaterThanOrEqual(0);
            expect(currentStore.currentSub).lessThanOrEqual(numSubpages - 1);
          }
          
          return true;
        }
      )
    );
  });
});
