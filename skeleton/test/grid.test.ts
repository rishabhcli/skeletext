// Tests for grid.ts (REQ-1)

import { describe, it, expect } from 'vitest';
import { createPage, getCell, setCell, getRow, HEADER_ROW, PROMPT_ROW, ROWS, COLS } from '../src/grid.js';
import * as fc from 'fast-check';

describe('grid', () => {
  describe('constants', () => {
    it('ROWS is 24', () => {
      expect(ROWS).toBe(24);
    });

    it('COLS is 40', () => {
      expect(COLS).toBe(40);
    });

    it('HEADER_ROW is 0', () => {
      expect(HEADER_ROW).toBe(0);
    });

    it('PROMPT_ROW is 23', () => {
      expect(PROMPT_ROW).toBe(23);
    });
  });

  describe('createPage', () => {
    it('returns a 960-byte Uint8Array', () => {
      const page = createPage();
      expect(page).toBeInstanceOf(Uint8Array);
      expect(page.length).toBe(960);
    });

    it('fills all cells with 0x20 (space)', () => {
      const page = createPage();
      for (let i = 0; i < page.length; i++) {
        expect(page[i]).toBe(0x20);
      }
    });
  });

  describe('getCell and setCell', () => {
    it('round-trips at (0,0)', () => {
      const page = createPage();
      setCell(page, 0, 0, 0x41);
      expect(getCell(page, 0, 0)).toBe(0x41);
    });

    it('round-trips at (0,39)', () => {
      const page = createPage();
      setCell(page, 0, 39, 0x5A);
      expect(getCell(page, 0, 39)).toBe(0x5A);
    });

    it('round-trips at (23,0)', () => {
      const page = createPage();
      setCell(page, 23, 0, 0x30);
      expect(getCell(page, 23, 0)).toBe(0x30);
    });

    it('round-trips at (23,39)', () => {
      const page = createPage();
      setCell(page, 23, 39, 0x7F);
      expect(getCell(page, 23, 39)).toBe(0x7F);
    });

    it('throws RangeError for byte > 127', () => {
      const page = createPage();
      expect(() => setCell(page, 0, 0, 0x80)).toThrow(RangeError);
      expect(() => setCell(page, 0, 0, 255)).toThrow(RangeError);
    });

    it('throws RangeError for row < 0', () => {
      const page = createPage();
      expect(() => setCell(page, -1, 0, 0x20)).toThrow(RangeError);
    });

    it('throws RangeError for row >= 24', () => {
      const page = createPage();
      expect(() => setCell(page, 24, 0, 0x20)).toThrow(RangeError);
    });

    it('throws RangeError for col < 0', () => {
      const page = createPage();
      expect(() => setCell(page, 0, -1, 0x20)).toThrow(RangeError);
    });

    it('throws RangeError for col >= 40', () => {
      const page = createPage();
      expect(() => setCell(page, 0, 40, 0x20)).toThrow(RangeError);
    });
  });

  describe('getRow', () => {
    it('returns a 40-byte Uint8Array', () => {
      const page = createPage();
      const row = getRow(page, 5);
      expect(row).toBeInstanceOf(Uint8Array);
      expect(row.length).toBe(40);
    });

    it('returns zero-copy view', () => {
      const page = createPage();
      const row = getRow(page, 3);
      setCell(page, 3, 5, 0x55);
      expect(row[5]).toBe(0x55);
    });

    it('throws RangeError for invalid row', () => {
      const page = createPage();
      expect(() => getRow(page, -1)).toThrow(RangeError);
      expect(() => getRow(page, 24)).toThrow(RangeError);
    });
  });

  describe('[PBT REQ-1.1]', () => {
    it('setCell then getCell returns the same byte, page length is always 960', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 23 }),
          fc.integer({ min: 0, max: 39 }),
          fc.integer({ min: 0, max: 127 }),
          (row, col, byte) => {
            const page = createPage();
            setCell(page, row, col, byte);
            expect(getCell(page, row, col)).toBe(byte);
            expect(page.length).toBe(960);
          }
        )
      );
    });
  });
});
