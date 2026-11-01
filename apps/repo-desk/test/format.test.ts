import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { formatAge, formatDate, formatDatetime, truncate, padLeft, padRight } from '../src/format.js';

describe('formatAge', () => {
  it('returns just now for 0 ms', () => {
    expect(formatAge(0)).toBe('just now');
  });

  it('returns just now for less than 60 seconds', () => {
    expect(formatAge(59_999)).toBe('just now');
  });

  it('returns N minutes ago for 60 seconds', () => {
    expect(formatAge(60_000)).toBe('1 minutes ago');
  });

  it('returns N hours ago for 1 hour', () => {
    expect(formatAge(3_600_000)).toBe('1 hours ago');
  });

  it('returns N days ago for 1 day', () => {
    expect(formatAge(86_400_000)).toBe('1 days ago');
  });

  it('returns N weeks ago for 1 week', () => {
    expect(formatAge(7 * 86_400_000)).toBe('1 weeks ago');
  });
});

describe('formatDate', () => {
  it('formats ISO string as MM-DD', () => {
    expect(formatDate('2024-03-15T10:00:00Z')).toBe('03-15');
  });

  it('handles edge case dates', () => {
    expect(formatDate('2024-01-01T00:00:00Z')).toBe('01-01');
    expect(formatDate('2024-12-31T23:59:59Z')).toBe('12-31');
  });

  it('throws RangeError for invalid date', () => {
    expect(() => formatDate('invalid')).toThrow(RangeError);
  });
});

describe('formatDatetime', () => {
  it('formats ISO string as MM-DD HH:MM', () => {
    expect(formatDatetime('2024-03-15T10:30:00Z')).toBe('03-15 10:30');
  });
});

describe('truncate', () => {
  it('truncates string to max length', () => {
    expect(truncate('hello world', 5)).toBe('hello');
  });

  it('returns original if shorter than max', () => {
    expect(truncate('hi', 10)).toBe('hi');
  });
});

describe('padLeft', () => {
  it('pads string on left to width', () => {
    expect(padLeft('42', 6)).toBe('    42');
  });

  it('returns original if already wide enough', () => {
    expect(padLeft('hello', 3)).toBe('hello');
  });
});

describe('padRight', () => {
  it('pads string on right to width', () => {
    expect(padRight('hi', 5)).toBe('hi   ');
  });

  it('returns original if already wide enough', () => {
    expect(padRight('hello', 3)).toBe('hello');
  });
});

describe('formatAge property tests', () => {
  it('REQ-8.4 returns string of 1-20 chars for any non-negative ageMs', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0 }), (ageMs) => {
        const result = formatAge(ageMs);
        expect(result.length).toBeGreaterThanOrEqual(1);
        expect(result.length).toBeLessThanOrEqual(20);
      })
    );
  });
});
