// Shared types for the skeleton-core package

// A 960-byte page grid (24 rows × 40 columns)
export type RawPage = Uint8Array;

// A single row of 40 bytes
export type RawRow = Uint8Array;

// Colour index: 0–7 (teletext palette)
export type Colour = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

// Size attribute for display cells
export type Size = 'normal' | 'double-height-top' | 'double-height-lower';

// Character mode: alpha (G0) or mosaic (G1)
export type CharMode = 'alpha' | 'mosaic';
