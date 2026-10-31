import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { magnitudeColour } from '../src/colour.js';

describe('magnitudeColour (REQ-10)', () => {
  it('uses white below 5, yellow from 5, red from 6', () => {
    expect(magnitudeColour(4.9)).toBe(7);
    expect(magnitudeColour(5)).toBe(3);
    expect(magnitudeColour(5.99)).toBe(3);
    expect(magnitudeColour(6)).toBe(1);
    expect(magnitudeColour(0)).toBe(7);
    expect(magnitudeColour(9.1)).toBe(1);
  });

  it('[PBT REQ-10.1] only white, yellow or red, and strength never maps backwards', () => {
    fc.assert(
      fc.property(fc.double({ min: -2, max: 10, noNaN: true }), fc.double({ min: -2, max: 10, noNaN: true }), (a, b) => {
        expect([1, 3, 7]).toContain(magnitudeColour(a));
        const rank = (c: number) => (c === 7 ? 0 : c === 3 ? 1 : 2);
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        expect(rank(magnitudeColour(lo))).toBeLessThanOrEqual(rank(magnitudeColour(hi)));
      }),
    );
  });
});
