// Cell model for teletext pages (REQ-1)

import type { RawPage, RawRow } from './types.js';

// Grid dimensions
export const ROWS = 24;
export const COLS = 40;

// Named accessors for special rows
export const HEADER_ROW = 0;
export const PROMPT_ROW = 23;

// Create a new 960-byte page filled with spaces (0x20)
export function createPage(): RawPage {
  const page = new Uint8Array(ROWS * COLS);
  page.fill(0x20);
  return page;
}

// Get a cell value at (row, col)
export function getCell(page: RawPage, row: number, col: number): number {
  if (row < 0 || row >= ROWS) {
    throw new RangeError(`Row index out of range: ${row}`);
  }
  if (col < 0 || col >= COLS) {
    throw new RangeError(`Column index out of range: ${col}`);
  }
  const value = page[row * COLS + col];
  if (value === undefined) {
    throw new RangeError(`Failed to read cell at (${row}, ${col})`);
  }
  return value;
}

// Set a cell value at (row, col)
export function setCell(page: RawPage, row: number, col: number, byte: number): void {
  if (row < 0 || row >= ROWS) {
    throw new RangeError(`Row index out of range: ${row}`);
  }
  if (col < 0 || col >= COLS) {
    throw new RangeError(`Column index out of range: ${col}`);
  }
  if (byte < 0 || byte > 127) {
    throw new RangeError(`Byte value out of range: ${byte}`);
  }
  page[row * COLS + col] = byte;
}

// Get a row as a 40-byte slice (zero-copy view)
export function getRow(page: RawPage, row: number): RawRow {
  if (row < 0 || row >= ROWS) {
    throw new RangeError(`Row index out of range: ${row}`);
  }
  return page.subarray(row * COLS, (row + 1) * COLS);
}
