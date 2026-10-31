// Control code table (REQ-2)
// Based on ETS 300 706 Table 26

import type { Colour } from './types.js';

export interface ControlCode {
  byte: number;
  name: string;
  timing: 'set-at' | 'set-after';
  noEffect: boolean;
}

// All 32 Level 1 spacing attributes
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
export const ROW_DEFAULTS: readonly number[] = [0x07, 0x09, 0x0A, 0x0C, 0x19, 0x1C, 0x1F] as const;

// Check if a byte is a set-at control code
export function isSetAt(byte: number): boolean {
  return [0x09, 0x0C, 0x18, 0x19, 0x1A, 0x1C, 0x1D, 0x1E].includes(byte);
}

// Check if a byte is a control code (0x00 to 0x1F)
export function isControlByte(byte: number): boolean {
  return byte >= 0x00 && byte <= 0x1F;
}
