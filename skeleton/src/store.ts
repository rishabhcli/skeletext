// Page store and router (REQ-5)

import type { RawPage } from './types.js';
import { type FastextConfig } from './fastext.js';

// Page store state - using plain numbers instead of branded types for simplicity
export interface Page {
  number: number; // 100-899
  subpages: RawPage[];
  fastext: FastextConfig;
}

export interface PageStore {
  pages: Map<number, Page>;
  currentPage: number; // 100-899
  currentSub: number; // 0 to k-1
}

// Create a new page store with no pages
export function createStore(): PageStore {
  return {
    pages: new Map(),
    currentPage: 100,
    currentSub: 0,
  };
}

// Validate and check page number
function isValidPageNumber(n: number): boolean {
  return n >= 100 && n <= 899;
}

// Add a page to the store
export function addPage(store: PageStore, number: number, subpages: RawPage[], fastext: FastextConfig): PageStore {
  if (!isValidPageNumber(number)) {
    throw new Error(`Page number out of range: ${number}`);
  }
  return {
    ...store,
    pages: new Map(store.pages).set(number, { number, subpages, fastext }),
  };
}

/** Next page number, wrapping from 899 to 100. */
export function nextPageNumber(n: number): number {
  if (!isValidPageNumber(n)) throw new RangeError(`Page number out of range: ${n}`);
  return n === 899 ? 100 : n + 1;
}

/** Previous page number, wrapping from 100 to 899. */
export function prevPageNumber(n: number): number {
  if (!isValidPageNumber(n)) throw new RangeError(`Page number out of range: ${n}`);
  return n === 100 ? 899 : n - 1;
}

/**
 * Neighbour of a page number in a direction. When `available` is given only those
 * page numbers are visited, wrapping around; otherwise every number from 100 to 899.
 */
export function neighbourPage(n: number, direction: 1 | -1, available?: readonly number[]): number {
  if (!available || available.length === 0) return direction === 1 ? nextPageNumber(n) : prevPageNumber(n);
  const sorted = [...new Set(available.filter(isValidPageNumber))].sort((a, b) => a - b);
  if (sorted.length === 0) return direction === 1 ? nextPageNumber(n) : prevPageNumber(n);
  if (direction === 1) return sorted.find((x) => x > n) ?? (sorted[0] as number);
  return [...sorted].reverse().find((x) => x < n) ?? (sorted[sorted.length - 1] as number);
}

// Navigate to the next stored page
export function nextPage(store: PageStore): PageStore {
  const numbers = Array.from(store.pages.keys()).sort((a, b) => a - b);
  if (numbers.length === 0) {
    return store;
  }
  const idx = numbers.indexOf(store.currentPage);
  const nextIdx = (idx + 1) % numbers.length;
  const nextNum = numbers[nextIdx] ?? store.currentPage;
  return {
    ...store,
    currentPage: nextNum,
    currentSub: 0,
  };
}

// Navigate to the previous page
export function prevPage(store: PageStore): PageStore {
  const numbers = Array.from(store.pages.keys()).sort((a, b) => a - b);
  if (numbers.length === 0) {
    return store;
  }
  const idx = numbers.indexOf(store.currentPage);
  const prevIdx = (idx - 1 + numbers.length) % numbers.length;
  const prevNum = numbers[prevIdx] ?? store.currentPage;
  return {
    ...store,
    currentPage: prevNum,
    currentSub: 0,
  };
}

// Go to a specific page
export function goToPage(store: PageStore, n: number): PageStore {
  if (!isValidPageNumber(n)) {
    throw new Error(`Page number out of range: ${n}`);
  }
  if (!store.pages.has(n)) {
    throw new Error(`Page not found: ${n}`);
  }
  return {
    ...store,
    currentPage: n,
    currentSub: 0,
  };
}

// Digit entry state
export interface DigitState {
  readonly digits: string;
}

// Enter a digit into the state machine
export function enterDigit(state: DigitState, digit: number): { next: DigitState; navigate: number | null } {
  // Leading 0 or 9 is invalid (would produce page < 100 or >= 900)
  if (state.digits.length === 0 && (digit === 0 || digit === 9)) {
    return { next: { digits: '' }, navigate: null };
  }
  
  const newDigits = state.digits + digit;
  
  // After three digits, navigate
  if (newDigits.length === 3) {
    const pageNum = parseInt(newDigits, 10);
    if (pageNum >= 100 && pageNum <= 899) {
      return { next: { digits: '' }, navigate: pageNum };
    } else {
      // Invalid page number after 3 digits - reset
      return { next: { digits: '' }, navigate: null };
    }
  }
  
  return { next: { digits: newDigits }, navigate: null };
}

// Carousel tick - advance subpage
export function tickCarousel(store: PageStore): PageStore {
  const currentPage = store.pages.get(store.currentPage);
  if (!currentPage) {
    return store;
  }
  
  const numSubpages = currentPage.subpages.length;
  if (numSubpages === 0) {
    return store;
  }
  
  const nextSub = (store.currentSub + 1) % numSubpages;
  return {
    ...store,
    currentSub: nextSub,
  };
}
