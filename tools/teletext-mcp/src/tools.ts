// Tool implementations for the teletext MCP server (spec: .kiro/specs/teletext-mcp).
// All page work goes through @skeletext/core; nothing is re-implemented here.

import { CONTROL_CODES, createPage, decode, encode, interpretPage, CodecError, COLS, ROWS, type RawPage, type DisplayCell } from '@skeletext/core';

export class RpcError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

const invalid = (message: string) => new RpcError(-32602, message);

/** Expand `\xHH` escapes. Returns the bytes, or throws RpcError(-32602). */
export function expandRow(input: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < input.length; i++) {
    const ch = input[i] as string;
    if (ch === '\\' && input[i + 1] === 'x') {
      const hex = input.slice(i + 2, i + 4);
      if (!/^[0-9A-Fa-f]{2}$/.test(hex)) throw invalid(`Bad escape in row: expected two hex digits after \\x, got "${hex}"`);
      out.push(parseInt(hex, 16));
      i += 3;
    } else {
      const code = ch.codePointAt(0) as number;
      if (code > 0x7f) throw invalid(`Row contains a character above 0x7F: U+${code.toString(16).toUpperCase()}`);
      out.push(code);
    }
  }
  return out;
}

function getRows(args: Record<string, unknown>): string[] {
  const rows = args['rows'];
  if (!Array.isArray(rows) || rows.length !== 24 || !rows.every((r) => typeof r === 'string')) {
    throw invalid('"rows" must be an array of exactly 24 strings');
  }
  return rows as string[];
}

function pageFromRows(rows: string[]): { page: RawPage; lengths: number[] } {
  const page = createPage();
  const lengths: number[] = [];
  rows.forEach((row, r) => {
    const bytes = expandRow(row);
    lengths.push(bytes.length);
    for (let c = 0; c < COLS; c++) page[r * COLS + c] = (bytes[c] ?? 0x20) & 0x7f;
  });
  return { page, lengths };
}

function pageFromArgs(args: Record<string, unknown>): { page: RawPage; lengths: number[] | null; raw: Uint8Array | null } {
  if (typeof args['encoded'] === 'string') {
    try {
      return { page: decode(args['encoded']), lengths: null, raw: null };
    } catch (e) {
      throw invalid(e instanceof CodecError ? e.message : 'Cannot decode "encoded"');
    }
  }
  if (args['rows'] !== undefined) {
    const { page, lengths } = pageFromRows(getRows(args));
    return { page, lengths, raw: null };
  }
  throw invalid('Provide either "encoded" or "rows"');
}

export function explainCode(args: Record<string, unknown>): Record<string, unknown> {
  const byte = args['byte'];
  if (typeof byte !== 'number' || !Number.isInteger(byte) || byte < 0 || byte > 255) throw invalid('"byte" must be an integer from 0 to 255');
  const hex = '0x' + byte.toString(16).toUpperCase().padStart(2, '0');
  if (byte <= 0x1f) {
    const code = CONTROL_CODES[byte];
    return { byte: hex, name: code?.name ?? 'undefined', timing: code?.timing ?? 'n/a', noEffect: code?.noEffect ?? false };
  }
  if (byte <= 0x7f) return { byte: hex, name: 'printable', timing: 'n/a', noEffect: false };
  return { byte: hex, name: 'undefined', timing: 'n/a', noEffect: false };
}

function drawCell(c: DisplayCell): string {
  if (c.charMode === 'mosaic') return c.mosaicMask !== 0 ? '#' : ' ';
  return c.char.length === 1 && c.char >= ' ' && c.char <= '~' ? c.char : c.char === '' || c.char === ' ' ? ' ' : '?';
}

export function renderPage(args: Record<string, unknown>): Record<string, unknown> {
  const { page } = pageFromArgs(args);
  const cells = interpretPage(page, args['reveal'] === true);
  return {
    drawing: cells.map((row) => row.map(drawCell).join('')).join('\n'),
    attributes: cells.map((row) => ({
      fg: row.map((c) => c.fg),
      bg: row.map((c) => c.bg),
      flash: row.map((c) => c.flash),
      size: row.map((c) => c.size),
      conceal: row.map((c) => c.conceal),
    })),
  };
}

export interface Violation {
  rule: string;
  row: number;
  col: number;
  message: string;
}

export function validatePage(args: Record<string, unknown>): Record<string, unknown> {
  const { page, lengths } = pageFromArgs(args);
  const violations: Violation[] = [];
  for (let r = 0; r < ROWS; r++) {
    if (lengths && (lengths[r] as number) > COLS) {
      violations.push({ rule: 'row-too-long', row: r, col: COLS, message: `Row expands to ${lengths[r]} bytes, the limit is 40` });
    }
    for (let c = 0; c < COLS; c++) {
      const b = page[r * COLS + c] as number;
      if (b === 0x0d && r === 23) violations.push({ rule: 'double-height-on-row-23', row: r, col: c, message: 'Double Height has no effect on row 23' });
      if (b === 0x0b) violations.push({ rule: 'start-box-on-normal-page', row: r, col: c, message: 'Start Box is only meaningful on newsflash and subtitle pages' });
      if (b > 0x7f) violations.push({ rule: 'byte-above-7f', row: r, col: c, message: 'Teletext bytes are 7-bit' });
    }
  }
  return { violations };
}

export function encodeRows(args: Record<string, unknown>): Record<string, unknown> {
  const { page } = pageFromRows(getRows(args));
  return { encoded: encode(page), byteCount: page.reduce((n, b) => n + (b === 0x20 ? 0 : 1), 0) };
}

const pageInput = {
  type: 'object',
  properties: {
    encoded: { type: 'string', description: 'A page as produced by encode_rows or the skeleton codec.' },
    rows: { type: 'array', items: { type: 'string' }, minItems: 24, maxItems: 24, description: '24 strings of up to 40 characters. Use \\xHH for control bytes, for example \\x0D for double height.' },
  },
};

export const TOOLS = [
  { name: 'explain_code', description: 'Name and set-at or set-after timing of a teletext byte (0 to 255), from the verified ETS 300 706 table.', inputSchema: { type: 'object', properties: { byte: { type: 'integer', minimum: 0, maximum: 255 } }, required: ['byte'] } },
  { name: 'render_page', description: 'Run the skeleton interpreter over a page and return a 24 line text drawing (mosaics as #) plus per-row display attributes.', inputSchema: { ...pageInput, properties: { ...pageInput.properties, reveal: { type: 'boolean' } } } },
  { name: 'validate_page', description: 'Check a page for rule violations: double height on row 23, Start Box, rows longer than 40 bytes, bytes above 0x7F.', inputSchema: pageInput },
  { name: 'encode_rows', description: 'Turn 24 row strings into the compact URL-safe page encoding.', inputSchema: { type: 'object', properties: { rows: pageInput.properties.rows }, required: ['rows'] } },
] as const;

export const HANDLERS: Record<string, (args: Record<string, unknown>) => Record<string, unknown>> = {
  explain_code: explainCode,
  render_page: renderPage,
  validate_page: validatePage,
  encode_rows: encodeRows,
};
