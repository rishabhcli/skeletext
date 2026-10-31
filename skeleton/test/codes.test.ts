// Tests for codes.ts (REQ-2)

import { describe, it, expect } from 'vitest';
import { CONTROL_CODES, ROW_DEFAULTS, isSetAt, isControlByte } from '../src/codes.js';
import type { ControlCode } from '../src/codes.js';

describe('codes', () => {
  describe('CONTROL_CODES', () => {
    it('has exactly 32 entries (REQ-2.1)', () => {
      expect(CONTROL_CODES.length).toBe(32);
    });

    it('entries are in byte order', () => {
      for (let i = 0; i < 32; i++) {
        const entry = CONTROL_CODES[i];
        if (entry !== undefined) {
          expect(entry.byte).toBe(i);
        }
      }
    });

    it('the set-at bytes are exactly [0x09, 0x0C, 0x18, 0x19, 0x1A, 0x1C, 0x1D, 0x1E] (REQ-2.2)', () => {
      const setAtBytes = CONTROL_CODES.filter((c) => c.timing === 'set-at').map((c) => c.byte);
      expect(setAtBytes).toEqual([0x09, 0x0C, 0x18, 0x19, 0x1A, 0x1C, 0x1D, 0x1E]);
    });

    it('the four no-effect bytes are [0x00, 0x0E, 0x0F, 0x10] (REQ-2.3)', () => {
      const noEffectBytes = CONTROL_CODES.filter((c) => c.noEffect).map((c) => c.byte);
      expect(noEffectBytes).toEqual([0x00, 0x0E, 0x0F, 0x10]);
    });
  });

  describe('ROW_DEFAULTS', () => {
    it('equals [0x07, 0x09, 0x0A, 0x0C, 0x19, 0x1C, 0x1F] (REQ-2.4)', () => {
      expect(ROW_DEFAULTS).toEqual([0x07, 0x09, 0x0A, 0x0C, 0x19, 0x1C, 0x1F]);
    });
  });

  describe('isSetAt', () => {
    it('returns true for set-at bytes', () => {
      expect(isSetAt(0x09)).toBe(true);
      expect(isSetAt(0x0C)).toBe(true);
      expect(isSetAt(0x18)).toBe(true);
      expect(isSetAt(0x19)).toBe(true);
      expect(isSetAt(0x1A)).toBe(true);
      expect(isSetAt(0x1C)).toBe(true);
      expect(isSetAt(0x1D)).toBe(true);
      expect(isSetAt(0x1E)).toBe(true);
    });

    it('returns false for set-after bytes', () => {
      expect(isSetAt(0x00)).toBe(false);
      expect(isSetAt(0x01)).toBe(false);
      expect(isSetAt(0x0D)).toBe(false);
      expect(isSetAt(0x1F)).toBe(false);
    });
  });

  describe('isControlByte', () => {
    it('returns true for bytes 0x00 to 0x1F', () => {
      for (let i = 0; i <= 0x1F; i++) {
        expect(isControlByte(i)).toBe(true);
      }
    });

    it('returns false for bytes outside 0x00 to 0x1F', () => {
      expect(isControlByte(0x20)).toBe(false);
      expect(isControlByte(0xFF)).toBe(false);
    });
  });

  describe('name verification', () => {
    it('matches ETS table for spot-checked entries', () => {
      const expectedNames: Record<number, string> = {
        0x0D: 'Double Height',
        0x09: 'Steady',
        0x19: 'Contiguous Mosaic Graphics',
        0x1E: 'Hold Mosaics',
        0x1D: 'New Background',
      };
      for (const [byte, expectedName] of Object.entries(expectedNames)) {
        const entry = CONTROL_CODES.find((c) => c.byte === Number(byte));
        expect(entry).not.toBeUndefined();
        expect(entry!.name).toBe(expectedName);
      }
    });
  });
});
