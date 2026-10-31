// Tests for mosaic.ts (REQ-4)

import { describe, it, expect } from 'vitest';
import { encodeBlockMask, decodeBlockMask } from '../src/mosaic.js';
import * as fc from 'fast-check';

describe('mosaic', () => {
  describe('encodeBlockMask', () => {
    it('encodeBlockMask(0) === 0x20 (REQ-4.3)', () => {
      expect(encodeBlockMask(0)).toBe(0x20);
    });

    it('encodeBlockMask(63) === 0x7F (REQ-4.3)', () => {
      expect(encodeBlockMask(63)).toBe(0x7F);
    });

    it('every encoded byte has bit 5 set (REQ-4.4)', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 63 }), (mask) => {
          const byte = encodeBlockMask(mask);
          expect(byte & 0x20).toBe(0x20);
        })
      );
    });
  });

  describe('decodeBlockMask', () => {
    it('decodes 0x20 back to 0', () => {
      expect(decodeBlockMask(0x20)).toBe(0);
    });

    it('decodes 0x7F back to 63', () => {
      expect(decodeBlockMask(0x7F)).toBe(63);
    });
  });

  describe('[PBT REQ-4.1]', () => {
    it('decodeBlockMask(encodeBlockMask(mask)) === mask', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 63 }), (mask) => {
          expect(decodeBlockMask(encodeBlockMask(mask))).toBe(mask);
        })
      );
    });
  });

  describe('[PBT REQ-4.2]', () => {
    it('encodeBlockMask(decodeBlockMask(byte)) === byte', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 63 }).map((mask) => encodeBlockMask(mask)),
          (byte) => {
            expect(encodeBlockMask(decodeBlockMask(byte))).toBe(byte);
          }
        )
      );
    });
  });
});
