// Display interpreter (REQ-3)
// Converts raw bytes to display cells with proper timing and attribute handling

import type { RawPage, Size, CharMode, Colour } from './types.js';
import { COLS, ROWS, getCell } from './grid.js';
import { isSetAt, isControlByte } from './codes.js';
import { decodeBlockMask } from './mosaic.js';

export interface DisplayCell {
  char: string;          // single character or empty string for control cells
  fg: Colour;            // foreground colour index 0–7
  bg: Colour;            // background colour index 0–7
  flash: boolean;        // true if Flash is active
  conceal: boolean;      // true if Conceal is active (for reveal logic)
  size: Size;            // normal, double-height-top, or double-height-lower
  charMode: CharMode;    // alpha or mosaic
  mosaicMask: number;    // 0–63 for mosaic cells
  separated: boolean;    // true if Separated Mosaic Graphics is active
}

// Attribute state carried across columns in a row scan
interface AttrState {
  fg: Colour;
  bg: Colour;
  flash: boolean;
  conceal: boolean;
  size: 'normal' | 'double-height-top';
  charMode: CharMode;
  separated: boolean;
  holdMosaics: boolean;
  heldMosaic: number | null;  // null = space; byte value of last G1 char (bit 6 = 1)
}

// Create the row-start default state
function rowDefaults(): AttrState {
  return {
    fg: 7,                       // Alpha White
    bg: 0,                       // Black Background
    flash: false,                // Steady
    conceal: false,              // End Box (not conceal)
    size: 'normal',              // Normal Size
    charMode: 'alpha',           // Alpha text mode
    separated: false,            // Contiguous Mosaic Graphics
    holdMosaics: false,          // Release Mosaics
    heldMosaic: null,
  };
}

// Get foreground colour index from byte (0x01-0x07 are colours, 0x11-0x17 are mosaic colours)
function colourFromByte(byte: number): Colour {
  if (byte >= 0x11 && byte <= 0x17) {
    return (byte - 0x11) as Colour;
  }
  if (byte >= 0x01 && byte <= 0x07) {
    return byte as Colour;
  }
  return 7; // white fallback
}

// Check if a byte is a printable character
function isPrintable(byte: number): boolean {
  return byte >= 0x20 && byte <= 0x7F;
}

// Get character for a byte in alpha mode
function charForAlpha(byte: number): string {
  if (byte >= 0x20 && byte <= 0x7F) {
    return String.fromCharCode(byte);
  }
  return '';
}

// Interpret a complete page: raw bytes → display cells
export function interpretPage(page: RawPage, reveal: boolean): DisplayCell[][] {
  const cells: DisplayCell[][] = Array.from({ length: ROWS }, () => Array(COLS));
  const doubleHeightLowerRows = new Set<number>();
  const lowerRowBackgrounds: Map<number, Colour[]> = new Map();

  // First pass: identify which rows are double-height lower rows
  // and scan those rows to extract their background colours
  for (let row = 0; row < ROWS - 1; row++) {
    let state = rowDefaults();
    for (let col = 0; col < COLS; col++) {
      const byte = getCell(page, row, col);
      if (byte === 0x0D && row < 23) {
        // Double Height encountered on row < 23
        doubleHeightLowerRows.add(row + 1);
      }
      // Update state for timing purposes
      if (isControlByte(byte)) {
        applyControl(byte, state);
      }
    }
  }

  // For double-height lower rows, scan to get background colours
  for (const lowerRow of doubleHeightLowerRows) {
    const state = rowDefaults();
    const bgColours: Colour[] = [];
    for (let col = 0; col < COLS; col++) {
      const byte = getCell(page, lowerRow, col);
      if (isControlByte(byte)) {
        applyControl(byte, state);
      }
      bgColours.push(state.bg);
    }
    lowerRowBackgrounds.set(lowerRow, bgColours);
  }

  // Second pass: scan rows and emit cells
  for (let row = 0; row < ROWS; row++) {
    const state = rowDefaults();
    const rowCells: DisplayCell[] = Array(COLS);
    const isDoubleHeightLower = doubleHeightLowerRows.has(row);
    const lowerBgs = lowerRowBackgrounds.get(row);

    for (let col = 0; col < COLS; col++) {
      const byte = getCell(page, row, col);

      if (isControlByte(byte)) {
        // Control byte
        const cell = emitControl(byte, state, isDoubleHeightLower, reveal, lowerBgs?.[col], row);
        rowCells[col] = cell;
      } else if (isPrintable(byte)) {
        // Printable character
        const cell = emitPrintable(byte, state, isDoubleHeightLower, reveal, lowerBgs?.[col], row);
        rowCells[col] = cell;

        // Update held mosaic if in mosaic mode and bit 6 is set
        if (state.charMode === 'mosaic' && (byte & 0x40) === 0x40) {
          state.heldMosaic = byte;
        }
      } else {
        // Shouldn't happen for valid bytes 0x00-0x7F
        rowCells[col] = emitSpace(state, isDoubleHeightLower, lowerBgs?.[col]);
      }
    }

    cells[row] = rowCells;
  }

  return cells;
}

// Apply a control byte to state and return whether to apply before or after
function applyControl(byte: number, state: AttrState): void {
  if (byte === 0x00 || byte === 0x0E || byte === 0x0F || byte === 0x10) {
    // No-effect codes: do nothing
    return;
  }

  // Colour codes (0x01–0x07 or 0x11–0x17): set foreground, select mode, clear conceal
  if ((byte >= 0x01 && byte <= 0x07) || (byte >= 0x11 && byte <= 0x17)) {
    state.fg = colourFromByte(byte);
    state.conceal = false;
    
    const newMode = (byte >= 0x11 && byte <= 0x17) ? 'mosaic' : 'alpha';
    // Reset held mosaic if mode is switching
    if (newMode !== state.charMode) {
      state.heldMosaic = null;
    }
    state.charMode = newMode;
    return;
  }

  // Flash (0x08): set-after
  if (byte === 0x08) {
    state.flash = true;
    return;
  }

  // Steady (0x09): set-at
  if (byte === 0x09) {
    state.flash = false;
    return;
  }

  // End Box (0x0A): set-after
  if (byte === 0x0A) {
    // Not used; no state change
    return;
  }

  // Start Box (0x0B): set-after
  if (byte === 0x0B) {
    // Not used; no state change
    return;
  }

  // Normal Size (0x0C): set-at
  if (byte === 0x0C) {
    if (state.size !== 'normal') {
      state.size = 'normal';
      state.heldMosaic = null; // Reset held mosaic on size change
    }
    return;
  }

  // Double Height (0x0D): set-after (but not on row 23)
  if (byte === 0x0D) {
    // Double Height has no effect on row 23
    // Size change -> reset held mosaic (but only if actually changing)
    if (state.size !== 'double-height-top') {
      state.size = 'double-height-top';
      state.heldMosaic = null;
    }
    return;
  }

  // Conceal (0x18): set-at
  if (byte === 0x18) {
    state.conceal = true;
    return;
  }

  // Contiguous Mosaic Graphics (0x19): set-at
  if (byte === 0x19) {
    state.separated = false;
    return;
  }

  // Separated Mosaic Graphics (0x1A): set-at
  if (byte === 0x1A) {
    state.separated = true;
    return;
  }

  // ESC (Switch) (0x1B): set-after; not implemented
  if (byte === 0x1B) {
    return;
  }

  // Black Background (0x1C): set-at
  if (byte === 0x1C) {
    state.bg = 0;
    return;
  }

  // New Background (0x1D): set-at
  if (byte === 0x1D) {
    state.bg = state.fg;
    return;
  }

  // Hold Mosaics (0x1E): set-at
  if (byte === 0x1E) {
    state.holdMosaics = true;
    return;
  }

  // Release Mosaics (0x1F): set-after
  if (byte === 0x1F) {
    state.holdMosaics = false;
    return;
  }
}

// Emit a cell for a control byte, handling set-at vs set-after timing
function emitControl(
  byte: number,
  state: AttrState,
  isDoubleHeightLower: boolean,
  reveal: boolean,
  lowerRowBg?: Colour,
  row?: number,
): DisplayCell {
  // For set-at codes, the attribute takes effect on this cell too
  // For set-after codes, we emit using the old state
  
  const isSetAtCode = isSetAt(byte);

  // Take a snapshot of the state before applying
  const priorFg = state.fg;
  const priorBg = state.bg;
  const priorFlash = state.flash;
  const priorConceal = state.conceal;
  const priorCharMode = state.charMode;
  const priorSeparated = state.separated;
  const priorSize = state.size;
  const priorHoldMosaics = state.holdMosaics;

  // Apply the control to state
  applyControl(byte, state);

  // On row 23, Double Height has no effect
  if (row === 23 && byte === 0x0D) {
    state.size = priorSize;
  }

  // Determine which state to use for this cell
  const cellFg = isSetAtCode ? state.fg : priorFg;
  const cellBg = isSetAtCode ? state.bg : priorBg;
  const cellFlash = isSetAtCode ? state.flash : priorFlash;
  const cellConceal = isSetAtCode ? state.conceal : priorConceal;

  // For display: if Hold Mosaics is active, show the held mosaic; otherwise show a space
  let char = '';
  let mosaicMask = 0;
  let displayCharMode: CharMode = 'alpha';

  if (state.holdMosaics && state.heldMosaic !== null) {
    // Under Hold Mosaics, emit the held mosaic character
    const heldByte = state.heldMosaic;
    mosaicMask = decodeBlockMask(heldByte);
    displayCharMode = 'mosaic';
  }

  if (isDoubleHeightLower) {
    return {
      char: '',
      fg: cellFg,
      bg: lowerRowBg ?? cellBg,
      flash: false,
      conceal: false,
      size: 'double-height-lower',
      charMode: 'alpha',
      mosaicMask: 0,
      separated: false,
    };
  }

  let cellSize: Size = 'normal';
  if (state.size === 'double-height-top') {
    cellSize = 'double-height-top';
  }

  return {
    char,
    fg: cellFg,
    bg: cellBg,
    flash: cellFlash,
    conceal: cellConceal && !reveal,
    size: cellSize,
    charMode: displayCharMode, // Use mosaic mode if Hold Mosaics active
    mosaicMask,
    separated: priorSeparated, // Separated state at time of emit
  };
}

// Emit a cell for a printable character
function emitPrintable(
  byte: number,
  state: AttrState,
  isDoubleHeightLower: boolean,
  reveal: boolean,
  lowerRowBg?: Colour,
  row?: number,
): DisplayCell {
  if (isDoubleHeightLower) {
    return {
      char: '',
      fg: state.fg,
      bg: lowerRowBg ?? state.bg,
      flash: false,
      conceal: false,
      size: 'double-height-lower',
      charMode: 'alpha',
      mosaicMask: 0,
      separated: false,
    };
  }

  let size: Size = 'normal';
  if (state.size === 'double-height-top') {
    size = 'double-height-top';
  }

  let char = '';
  let mosaicMask = 0;
  let charMode: CharMode = 'alpha';

  if (state.charMode === 'mosaic') {
    // In mosaic mode, check bit 6
    if ((byte & 0x40) === 0x40) {
      // Mosaic character (bit 6 = 1)
      charMode = 'mosaic';
      mosaicMask = decodeBlockMask(byte);
    } else {
      // Capital letter (bit 6 = 0, codes 0x40–0x5F)
      charMode = 'alpha';
      char = String.fromCharCode(byte);
    }
  } else {
    // Alpha mode: just the character
    char = charForAlpha(byte);
    charMode = 'alpha';
  }

  let displayChar = char;
  let displayMask = mosaicMask;

  // Apply conceal: if active and reveal is off, hide glyph
  if (state.conceal && !reveal) {
    displayChar = '';
    displayMask = 0;
  }

  return {
    char: displayChar,
    fg: state.fg,
    bg: state.bg,
    flash: state.flash,
    conceal: state.conceal && !reveal,
    size,
    charMode,
    mosaicMask: displayMask,
    separated: state.separated,
  };
}

// Emit a plain space cell
function emitSpace(state: AttrState, isDoubleHeightLower: boolean, lowerRowBg?: Colour): DisplayCell {
  if (isDoubleHeightLower) {
    return {
      char: '',
      fg: state.fg,
      bg: lowerRowBg ?? state.bg,
      flash: false,
      conceal: false,
      size: 'double-height-lower',
      charMode: 'alpha',
      mosaicMask: 0,
      separated: false,
    };
  }

  let size: Size = 'normal';
  if (state.size === 'double-height-top') {
    size = 'double-height-top';
  }

  return {
    char: ' ',
    fg: state.fg,
    bg: state.bg,
    flash: state.flash,
    conceal: false,
    size,
    charMode: 'alpha',
    mosaicMask: 0,
    separated: state.separated,
  };
}
