// Shared types for the skeleton package

// A raw teletext page is a flat 960-byte Uint8Array (24 rows × 40 columns)
export type RawPage = Uint8Array;

// A single row is a 40-byte slice of RawPage
export type RawRow = Uint8Array;

// Colour index: 0-7 for the 8-colour palette
export type Colour = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

// Cell size attribute
export type Size = 'normal' | 'double-height-top' | 'double-height-lower';

// Character mode: alpha (G0) or mosaic (G1)
export type CharMode = 'alpha' | 'mosaic';
