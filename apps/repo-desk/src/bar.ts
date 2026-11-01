import type { RawPage } from '@skeletext/core';
import { encodeBlockMask, setCell } from '@skeletext/core';

/** Calculate bar width in cells based on value ratio. */
export function barWidth(value: number, maxValue: number, maxCols: number): number {
  if (maxValue === 0) {
    return 0;
  }
  return Math.round((value / maxValue) * maxCols);
}

/** Draw a mosaic bar on a page row. */
export function drawBar(page: RawPage, row: number, colStart: number, widthCols: number, mosaicColourByte: number): void {
  if (widthCols === 0) {
    return;
  }
  setCell(page, row, colStart, mosaicColourByte);
  const blockByte = encodeBlockMask(0x3F);
  for (let i = 0; i < widthCols; i++) {
    setCell(page, row, colStart + 1 + i, blockByte);
  }
}
