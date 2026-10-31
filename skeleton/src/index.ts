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

// Grid constants
export { ROWS, COLS } from './grid.js';

// Display interpreter
export type { DisplayCell } from './interpreter.js';
export { interpretPage } from './interpreter.js';

// Page store, navigation and digit entry
export type { Page, PageStore, DigitState } from './store.js';
export {
  createStore,
  addPage,
  nextPage,
  prevPage,
  goToPage,
  enterDigit,
  tickCarousel,
  nextPageNumber,
  prevPageNumber,
  neighbourPage,
} from './store.js';

// Fastext
export type { FastextConfig, FastextLabels } from './fastext.js';
export { fillPromptRow, handleFastextKey } from './fastext.js';

// Codec
export { encode, decode, CodecError } from './codec.js';

// SVG renderer
export { renderSVG, escapeXml, PALETTE, CELL_W, CELL_H, SVG_W, SVG_H } from './renderer.js';

// Page composition and system pages
export type { TextOptions } from './builder.js';
export { PageBuilder, wrapText, toAscii } from './builder.js';
export { makeNotFoundPage, makeErrorPage, makeLoadingPage } from './system-pages.js';

// Viewer
export type { ProvidedPage, PageProvider, ViewerAction, ViewerStatus, ViewerState, ViewerEvent, ViewerOptions, TeletextController } from './viewer.js';
export { mapKey, reduce, initialState, startCarousel, decorate, screenPage, indexPageOf, mountTeletext } from './viewer.js';
