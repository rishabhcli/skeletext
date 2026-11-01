import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createPage, getRow } from '@skeletext/core';
import { barWidth, drawBar } from '../src/bar.js';

describe('barWidth', () => {
  it('returns 0 for value 0', () => {
    expect(barWidth(0, 100, 20)).toBe(0);
  });

  it('returns maxCols for value equal to maxValue', () => {
    expect(barWidth(100, 100, 20)).toBe(20);
  });

  it('returns half maxCols for value half of maxValue', () => {
    expect(barWidth(50, 100, 20)).toBe(10);
  });

  it('returns 0 for division by zero guard', () => {
    expect(barWidth(0, 0, 20)).toBe(0);
  });
});

describe('drawBar', () => {
  it('writes exactly widthCols non-space bytes on target row', () => {
    const page = createPage();
    const row = 5;
    const colStart = 10;
    const widthCols = 5;
    const colourByte = 0x17;

    drawBar(page, row, colStart, widthCols, colourByte);

    const rowBytes = getRow(page, row);
    let found = 0;
    for (let i = colStart; i < colStart + widthCols; i++) {
      if (rowBytes[i] !== undefined && rowBytes[i] !== 0x20) {
        found++;
      }
    }
    expect(found).toBe(widthCols);
  });

  it('writes colour byte at colStart', () => {
    const page = createPage();
    const row = 5;
    const colStart = 10;
    const widthCols = 5;
    const colourByte = 0x17;

    drawBar(page, row, colStart, widthCols, colourByte);

    expect(getRow(page, row)[colStart]).toBe(colourByte);
  });
});

describe('drawBar property tests', () => {
  it('REQ-13.7 every mosaic byte satisfies byte & 0x20 === 0x20', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 0x11, max: 0x17 }),
        fc.integer({ min: 0, max: 38 }),
        (value, maxValue, maxCols, colourByte, colStart) => {
          const page = createPage();
          const row = 5;
          const width = barWidth(value, maxValue, maxCols);
          // Ensure colStart + 1 + width <= 40
          if (colStart + 1 + width <= 40) {
            drawBar(page, row, colStart, width, colourByte);

            const rowBytes = getRow(page, row);
            for (let i = colStart + 1; i < colStart + 1 + width; i++) {
              const cell = rowBytes[i];
              if (cell !== undefined) {
                expect(cell & 0x20).toBe(0x20);
              }
            }
          }
        }
      )
    );
  });
});
