// Page composition helpers (REQ-10)
// A small builder so apps never have to write raw control bytes by hand.
// Every colour or size control code sits in its own cell, text is cut at column 39
// with a visible '>' marker and row 23 is reserved for the Fastext prompt row.

import type { RawPage, Colour } from './types.js';
import { createPage, setCell, COLS, ROWS, PROMPT_ROW } from './grid.js';
import { encodeBlockMask } from './mosaic.js';
import { fillPromptRow, type FastextConfig, type FastextLabels } from './fastext.js';

export interface TextOptions {
  /** Text colour 1 to 7 (black text is not available at Level 1, 0 is shown as white). */
  fg?: Colour;
  /** Background colour 1 to 7, drawn with the New Background code. Omit for black. */
  bg?: Colour;
  /** Flash the text. */
  flash?: boolean;
}

const WHITE: Colour = 7;
const YELLOW: Colour = 3;
const CYAN: Colour = 6;
const GREEN: Colour = 2;

const CODE_FLASH = 0x08;
const CODE_STEADY = 0x09;
const CODE_DOUBLE = 0x0d;
const CODE_NEW_BG = 0x1d;
const CODE_BLACK_BG = 0x1c;

/** Reduce any string to printable ASCII. Accents are dropped, anything else becomes '?'. */
export function toAscii(s: string): string {
  const flat = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let out = '';
  for (const ch of flat) {
    const code = ch.codePointAt(0) ?? 0x3f;
    out += code >= 0x20 && code <= 0x7e ? ch : '?';
  }
  return out;
}

/** Greedy word wrap. Words longer than the width are split. Rejoining the lines with spaces gives the original words. */
export function wrapText(str: string, width: number): string[] {
  const w = Math.max(1, Math.floor(width));
  const lines: string[] = [];
  let line = '';
  for (const word of toAscii(str).split(/\s+/).filter((x) => x.length > 0)) {
    let rest = word;
    while (rest.length > w) {
      if (line) {
        lines.push(line);
        line = '';
      }
      lines.push(rest.slice(0, w));
      rest = rest.slice(w);
    }
    if (line === '') line = rest;
    else if (line.length + 1 + rest.length <= w) line += ' ' + rest;
    else {
      lines.push(line);
      line = rest;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const fgCode = (c: Colour): number => (c >= 1 && c <= 7 ? c : 7);
const mosaicCode = (c: Colour): number => 0x10 + fgCode(c);

export class PageBuilder {
  private readonly page: RawPage = createPage();

  private put(row: number, col: number, byte: number): void {
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return;
    setCell(this.page, row, col, byte & 0x7f);
  }

  /**
   * Write coloured text. A colour code is written at `col` and the characters start at `col + 1`
   * (plus two more cells when a background is used). Text that does not fit is cut and ends with '>'.
   * Row 23 is reserved: writing there throws a RangeError.
   */
  text(row: number, col: number, str: string, options: TextOptions = {}): this {
    if (!Number.isInteger(row) || row < 0 || row >= ROWS) throw new RangeError(`Row out of range: ${row}`);
    if (row === PROMPT_ROW) throw new RangeError('Row 23 is reserved for the Fastext prompt row');
    if (!Number.isInteger(col) || col < 0 || col >= COLS) throw new RangeError(`Column out of range: ${col}`);

    const prefix: number[] = [];
    if (options.bg !== undefined && options.bg >= 1) {
      prefix.push(fgCode(options.bg), CODE_NEW_BG);
    }
    prefix.push(fgCode(options.fg ?? WHITE));
    prefix.push(options.flash ? CODE_FLASH : CODE_STEADY);
    const suffix: number[] = [];
    if (options.bg !== undefined && options.bg >= 1) suffix.push(CODE_BLACK_BG);

    const room = COLS - col - prefix.length - suffix.length;
    if (room <= 0) return this;
    let visible = toAscii(str);
    if (visible.length > room) visible = room >= 2 ? visible.slice(0, room - 1) + '>' : '>';
    const bytes = [...prefix, ...Array.from(visible).map((c) => c.charCodeAt(0)), ...suffix];
    bytes.forEach((b, i) => this.put(row, col + i, b));
    return this;
  }

  /** Row 0: page number at the left, service name, and an 8 character clock at columns 32 to 39. */
  header(pageNumber: number, serviceName: string, clockText = ''): this {
    for (let c = 0; c < COLS; c++) this.put(0, c, 0x20);
    this.put(0, 0, fgCode(WHITE));
    Array.from(`P${pageNumber}`.slice(0, 4)).forEach((ch, i) => this.put(0, 1 + i, ch.charCodeAt(0)));
    this.put(0, 5, fgCode(CYAN));
    Array.from(toAscii(serviceName).slice(0, 24)).forEach((ch, i) => this.put(0, 6 + i, ch.charCodeAt(0)));
    this.put(0, 31, fgCode(YELLOW));
    Array.from(toAscii(clockText).padEnd(8, ' ').slice(0, 8)).forEach((ch, i) => this.put(0, 32 + i, ch.charCodeAt(0)));
    return this;
  }

  /** Rows 1 and 2: double-height cyan title. Row 2 is consumed by the double height and stays empty. */
  title(str: string): this {
    for (let c = 0; c < COLS; c++) {
      this.put(1, c, 0x20);
      this.put(2, c, 0x20);
    }
    this.put(1, 0, CODE_DOUBLE);
    this.put(1, 1, fgCode(CYAN));
    Array.from(toAscii(str).slice(0, COLS - 2)).forEach((ch, i) => this.put(1, 2 + i, ch.charCodeAt(0)));
    return this;
  }

  /** Section heading in yellow. */
  heading(row: number, str: string): this {
    return this.text(row, 0, str, { fg: YELLOW });
  }

  /** Live value in white. */
  value(row: number, col: number, str: string): this {
    return this.text(row, col, str, { fg: WHITE });
  }

  /** A label on the left in green and a value right-aligned to column 39 in white. */
  listRow(row: number, label: string, value: string, valueColour: Colour = WHITE): this {
    const v = toAscii(value).slice(0, 30);
    const valueCol = COLS - v.length - 2; // colour code + steady code + text end at column 39
    let l = toAscii(label);
    const maxLabel = valueCol - 1 - 2; // two control cells in front of the label and one gap cell
    if (maxLabel < 1) l = '';
    else if (l.length > maxLabel) l = l.slice(0, maxLabel - 1) + '>';
    if (l.length > 0) this.text(row, 0, l, { fg: GREEN });
    return this.text(row, Math.max(valueCol, 0), v, { fg: valueColour });
  }

  /**
   * Horizontal bar of block mosaics. `fraction` is clamped to 0 to 1, bar width is `width` cells
   * (two blocks per cell, so half-cell resolution), a mosaic colour code takes the cell before it.
   */
  mosaicBar(row: number, col: number, width: number, fraction: number, colour: Colour): this {
    if (!Number.isInteger(row) || row < 0 || row >= ROWS) throw new RangeError(`Row out of range: ${row}`);
    if (row === PROMPT_ROW) throw new RangeError('Row 23 is reserved for the Fastext prompt row');
    if (!Number.isInteger(col) || col < 0 || col >= COLS) throw new RangeError(`Column out of range: ${col}`);
    const cells = Math.max(0, Math.min(Math.floor(width), COLS - col - 1));
    const f = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
    const halves = Math.round(f * cells * 2);
    this.put(row, col, mosaicCode(colour));
    for (let i = 0; i < cells; i++) {
      const filledHalves = Math.max(0, Math.min(2, halves - i * 2));
      const mask = filledHalves === 2 ? 63 : filledHalves === 1 ? 0b010101 : 0;
      this.put(row, col + 1 + i, encodeBlockMask(mask));
    }
    // Back to text mode with white so later cells on the row are readable.
    this.put(row, col + 1 + cells, fgCode(WHITE));
    return this;
  }

  /** Row 23: the four coloured Fastext labels. */
  prompt(config: FastextConfig, labels: FastextLabels): this {
    const row = fillPromptRow(config, labels);
    for (let c = 0; c < COLS; c++) this.put(PROMPT_ROW, c, row[c] ?? 0x20);
    return this;
  }

  /** The finished page. The builder keeps its own copy, so later calls do not change a built page. */
  build(): RawPage {
    return this.page.slice();
  }
}
