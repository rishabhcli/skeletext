import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import { isCacheValid, readCache, writeCache } from '../src/cache.js';

// Mock localStorage for testing
const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

// Replace localStorage with mock
beforeEach(() => {
  global.localStorage = mockLocalStorage as any;
});

describe('isCacheValid', () => {
  const now = 1000000;

  it('returns true for entry less than 5 minutes old', () => {
    expect(isCacheValid({ data: {}, timestamp: now - 299_999 }, now)).toBe(true);
  });

  it('returns false for entry exactly 5 minutes old', () => {
    expect(isCacheValid({ data: {}, timestamp: now - 300_000 }, now)).toBe(false);
  });

  it('returns false for entry more than 5 minutes old', () => {
    expect(isCacheValid({ data: {}, timestamp: now - 300_001 }, now)).toBe(false);
  });
});

describe('writeCache and readCache', () => {
  const key = 'test-key';
  const testData = { foo: 'bar', count: 42 };

  it('writeCache then readCache returns matching data', () => {
    writeCache(key, testData);
    const result = readCache(key);
    expect(result).not.toBeNull();
    expect(result!.data).toEqual(testData);
    expect(typeof result!.timestamp).toBe('number');
  });

  it('readCache for unknown key returns null', () => {
    expect(readCache('unknown-key')).toBeNull();
  });

  it('does not throw when localStorage throws', () => {
    const originalSetItem = mockLocalStorage.setItem;
    mockLocalStorage.setItem = function() {
      throw new Error('Quota exceeded');
    } as any;

    expect(() => writeCache(key, testData)).not.toThrow();
    mockLocalStorage.setItem = originalSetItem as any;
  });
});

describe('isCacheValid property tests', () => {
  it('REQ-6.2 returns true iff now - timestamp < 300_000', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0 }), fc.integer({ min: 0 }), (timestamp, now) => {
        const entry = { data: {}, timestamp };
        const result = isCacheValid(entry, now);
        const expected = now - timestamp < 300_000;
        expect(result).toBe(expected);
      })
    );
  });
});
