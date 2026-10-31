// Public API barrel for @skeletext/core
// Re-exports all public names from every module

// Types
export type { RawPage, RawRow, Colour, Size, CharMode } from './types.js';

// Grid (cell model)
export { createPage, getCell, setCell, getRow, HEADER_ROW, PROMPT_ROW } from './grid.js';

// Control codes
export type { ControlCode } from './codes.js';
export { CONTROL_CODES, ROW_DEFAULTS, isSetAt, isControlByte } from './codes.js';

// Mosaic helpers
export { encodeBlockMask, decodeBlockMask } from './mosaic.js';
