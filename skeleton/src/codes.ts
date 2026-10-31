// Control code table (REQ-2)

import type { Colour } from './types.js';

// Control code entry
export interface ControlCode {
  byte: number;     // 0x00 to 0x1F
  name: string;     // canonical ETS 300 706 name
  timing: 'set-at' | 'set-after';
  noEffect: boolean; // true for codes without effect at Level 1
}

// All 32 Level 1 spacing attributes (ETSI ETS 300 706 Table 26)
// The four no-effect codes at Level 1: Alpha Black (0x00), Mosaics Black (0x10),
// Double Width (0x0E), Double Size (0x0F)
export const CONTROL_CODES: readonly ControlCode[] = [
  { byte: 0x00, name: 'Alpha Black', timing: 'set-after', noEffect: true },
  { byte: 0x01, name: 'Alpha Red', timing: 'set-after', noEffect: false },
  { byte: 0x02, name: 'Alpha Green', timing: 'set-after', noEffect: false },
  { byte: 0x03, name: 'Alpha Yellow', timing: 'set-after', noEffect: false },
  { byte: 0x04, name: 'Alpha Blue', timing: 'set-after', noEffect: false },
  { byte: 0x05, name: 'Alpha Magenta', timing: 'set-after', noEffect: false },
  { byte: 0x06, name: 'Alpha Cyan', timing: 'set-after', noEffect: false },
  { byte: 0x07, name: 'Alpha White', timing: 'set-after', noEffect: false },
  { byte: 0x08, name: 'Flash', timing: 'set-after', noEffect: false },
  { byte: 0x09, name: 'Steady', timing: 'set-at', noEffect: false },
  { byte: 0x0A, name: 'End Box', timing: 'set-after', noEffect: false },
  { byte: 0x0B, name: 'Start Box', timing: 'set-after', noEffect: false },
  { byte: 0x0C, name: 'Normal Size', timing: 'set-at', noEffect: false },
  { byte: 0x0D, name: 'Double Height', timing: 'set-after', noEffect: false },
  { byte: 0x0E, name: 'Double Width', timing: 'set-after', noEffect: true },
  { byte: 0x0F, name: 'Double Size', timing: 'set-after', noEffect: true },
  { byte: 0x10, name: 'Mosaics Black', timing: 'set-after', noEffect: true },
  { byte: 0x11, name: 'Mosaics Red', timing: 'set-after', noEffect: false },
  { byte: 0x12, name: 'Mosaics Green', timing: 'set-after', noEffect: false },
  { byte: 0x13, name: 'Mosaics Yellow', timing: 'set-after', noEffect: false },
  { byte: 0x14, name: 'Mosaics Blue', timing: 'set-after', noEffect: false },
  { byte: 0x15, name: 'Mosaics Magenta', timing: 'set-after', noEffect: false },
  { byte: 0x16, name: 'Mosaics Cyan', timing: 'set-after', noEffect: false },
  { byte: 0x17, name: 'Mosaics White', timing: 'set-after', noEffect: false },
  { byte: 0x18, name: 'Conceal', timing: 'set-at', noEffect: false },
  { byte: 0x19, name: 'Contiguous Mosaic Graphics', timing: 'set-at', noEffect: false },
  { byte: 0x1A, name: 'Separated Mosaic Graphics', timing: 'set-at', noEffect: false },
  { byte: 0x1B, name: 'ESC (Switch)', timing: 'set-after', noEffect: false },
  { byte: 0x1C, name: 'Black Background', timing: 'set-at', noEffect: false },
  { byte: 0x1D, name: 'New Background', timing: 'set-at', noEffect: false },
  { byte: 0x1E, name: 'Hold Mosaics', timing: 'set-at', noEffect: false },
  { byte: 0x1F, name: 'Release Mosaics', timing: 'set-after', noEffect: false },
] as const;

// The seven default bytes applied at the start of each row
// Alpha White (0x07), Steady (0x09), End Box (0x0A), Normal Size (0x0C),
// Contiguous Mosaic Graphics (0x19), Black Background (0x1C), Release Mosaics (0x1F)
export const ROW_DEFAULTS: readonly number[] = [0x07, 0x09, 0x0A, 0x0C, 0x19, 0x1C, 0x1F] as const;

// Check if a control byte is set-at
export function isSetAt(byte: number): boolean {
  return byte === 0x09 || byte === 0x0C || byte === 0x18 || byte === 0x19 || byte === 0x1A || byte === 0x1C || byte === 0x1D || byte === 0x1E;
}

// Check if a byte is a control byte (0x00-0x1F)
export function isControlByte(byte: number): boolean {
  return byte >= 0x00 && byte <= 0x1F;
}
