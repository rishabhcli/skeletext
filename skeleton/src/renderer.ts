// SVG renderer (REQ-8)
// Turns the display cells from interpretPage into a deterministic SVG string.
// Pure function: no DOM access, so it runs in Node tests and in the browser.

import type { DisplayCell } from './interpreter.js';
import { COLS, ROWS } from './grid.js';

export const CELL_W = 12;
export const CELL_H = 20;
export const SVG_W = CELL_W * COLS;
export const SVG_H = CELL_H * ROWS;

/** The eight teletext colours in index order: black, red, green, yellow, blue, magenta, cyan, white. */
export const PALETTE: readonly string[] = ['#000000', '#ff2a2a', '#2aff2a', '#ffff2a', '#2a5cff', '#ff2aff', '#2affff', '#ffffff'];

const FONT = "'Bedstead','Menlo','DejaVu Sans Mono','Consolas','Courier New',monospace";

/** Escape a string for use in SVG text or attribute values. */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function colour(index: number): string {
  return PALETTE[index] ?? '#ffffff';
}

// Block geometry for a 2 x 3 mosaic cell: [mask bit, column, row].
const BLOCKS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0],
  [2, 1, 0],
  [4, 0, 1],
  [8, 1, 1],
  [16, 0, 2],
  [32, 1, 2],
];
const ROW_EDGES = [0, 7, 13, 20];
const COL_EDGES = [0, 6, 12];

function mosaicRects(cell: DisplayCell, x: number, y: number): string {
  let out = '';
  for (const [bit, c, r] of BLOCKS) {
    if ((cell.mosaicMask & bit) === 0) continue;
    const x0 = x + (COL_EDGES[c] as number);
    const y0 = y + (ROW_EDGES[r] as number);
    const w = (COL_EDGES[c + 1] as number) - (COL_EDGES[c] as number) - (cell.separated ? 1 : 0);
    const h = (ROW_EDGES[r + 1] as number) - (ROW_EDGES[r] as number) - (cell.separated ? 1 : 0);
    out += `<rect class="m" x="${x0}" y="${y0}" width="${w}" height="${h}" fill="${colour(cell.fg)}"/>`;
  }
  return out;
}

function glyph(cell: DisplayCell, col: number, row: number): string {
  const x = col * CELL_W;
  const y = row * CELL_H;
  let body = '';
  if (cell.charMode === 'mosaic' && cell.mosaicMask !== 0) {
    if (cell.size === 'double-height-top') {
      // Mosaics stretch over two rows: draw at half the blocks' height scale, doubled.
      body = `<g transform="translate(${x} ${y}) scale(1 2)">${mosaicRects(cell, 0, 0)}</g>`;
    } else {
      body = mosaicRects(cell, x, y);
    }
  } else if (cell.char !== ' ' && cell.char !== '') {
    const cx = x + CELL_W / 2;
    const text = escapeXml(cell.char);
    if (cell.size === 'double-height-top') {
      body = `<text class="t" transform="translate(${cx} ${y + 30}) scale(1 2)" text-anchor="middle" fill="${colour(cell.fg)}">${text}</text>`;
    } else {
      body = `<text class="t" x="${cx}" y="${y + 15}" text-anchor="middle" fill="${colour(cell.fg)}">${text}</text>`;
    }
  }
  if (body === '') return '';
  return cell.flash ? `<g class="flash">${body}</g>` : body;
}

/**
 * Render display cells as an SVG document string.
 * Backgrounds are drawn as one rect per run of equal colour in a row, then glyphs on top.
 */
export function renderSVG(cells: DisplayCell[][]): string {
  let bg = '';
  let fg = '';
  for (let row = 0; row < cells.length; row++) {
    const line = cells[row] as DisplayCell[];
    let start = 0;
    while (start < line.length) {
      const c0 = (line[start] as DisplayCell).bg;
      let end = start + 1;
      while (end < line.length && (line[end] as DisplayCell).bg === c0) end++;
      bg += `<rect x="${start * CELL_W}" y="${row * CELL_H}" width="${(end - start) * CELL_W}" height="${CELL_H}" fill="${colour(c0)}"/>`;
      start = end;
    }
    for (let col = 0; col < line.length; col++) {
      const cell = line[col] as DisplayCell;
      // A double-height top glyph is drawn from its own row, the lower row only has the background.
      fg += glyph(cell, col, row);
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_W} ${SVG_H}" preserveAspectRatio="xMidYMid meet" style="display:block;width:100%;height:auto;background:#000" ` +
    `role="img" aria-label="Teletext page" font-family="${FONT}" font-size="19" shape-rendering="crispEdges">` +
    `<style>.flash{animation:tt-flash 1s steps(1,end) infinite}@keyframes tt-flash{0%{opacity:1}50%{opacity:0}}` +
    `@media (prefers-reduced-motion:reduce){.flash{animation:none}}</style>` +
    `<rect width="${SVG_W}" height="${SVG_H}" fill="#000000"/>` +
    `<g class="bg" shape-rendering="crispEdges">${bg}</g>` +
    `<g class="fg" shape-rendering="auto">${fg}</g>` +
    `</svg>`
  );
}
