import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { encode, decode, CodecError } from '../src/codec.js';
import { fillPromptRow } from '../src/fastext.js';
import { isControlByte } from '../src/codes.js';
import type { RawPage } from '../src/types.js';

const anyPage = fc.uint8Array({ minLength: 960, maxLength: 960 }).map((a) => a.map((x) => x & 0x7f) as RawPage);
const runPage = fc
  .array(fc.tuple(fc.integer({ min: 0, max: 0x7f }), fc.integer({ min: 1, max: 300 })), { minLength: 1, maxLength: 40 })
  .map((runs) => {
    const out: number[] = [];
    for (const [b, n] of runs) for (let i = 0; i < n && out.length < 960; i++) out.push(b);
    while (out.length < 960) out.push(0x20);
    return Uint8Array.from(out) as RawPage;
  });

describe('codec hardening (REQ-7)', () => {
  it('[PBT REQ-7.1b] pages that are mostly runs of control bytes round trip', () => {
    fc.assert(
      fc.property(runPage, (p) => {
        expect(decode(encode(p))).toEqual(p);
      }),
      { numRuns: 300 },
    );
  });

  it('[PBT REQ-7.5] a page of one repeated byte encodes much shorter than 960 characters', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0x7f }), (b) => {
        expect(encode(new Uint8Array(960).fill(b) as RawPage).length).toBeLessThan(40);
      }),
    );
  });

  it('[PBT REQ-7.6] decode never returns a page with bytes above 0x7F and never throws anything but CodecError', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 1500 }), (s) => {
        try {
          const page = decode(s);
          expect(page.length).toBe(960);
          expect(page.every((b) => b <= 0x7f)).toBe(true);
        } catch (e) {
          expect(e).toBeInstanceOf(CodecError);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('truncating a valid encoding is rejected', () => {
    const p = new Uint8Array(960).fill(0x41) as RawPage;
    const s = encode(p);
    expect(() => decode(s.slice(0, s.length - 4))).toThrow(CodecError);
    expect(() => decode('')).toThrow(CodecError);
  });

  it('[PBT REQ-7.2b] the page is always 960 bytes after decoding an encoding', () => {
    fc.assert(
      fc.property(anyPage, (p) => {
        expect(decode(encode(p)).length).toBe(960);
      }),
      { numRuns: 100 },
    );
  });
});

describe('Fastext prompt row hardening (REQ-6)', () => {
  const links = { red: 100, green: 110, yellow: 140, cyan: 150, index: 100 };
  it('[PBT REQ-6.4] whatever the labels contain, the row has 40 cells, exactly the four colour codes and nothing above 0x7F', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 30 }), fc.string({ maxLength: 30 }), fc.string({ maxLength: 30 }), fc.string({ maxLength: 30 }), (red, green, yellow, cyan) => {
        const row = fillPromptRow(links, { red, green, yellow, cyan });
        expect(row.length).toBe(40);
        const controls = Array.from(row).filter(isControlByte);
        expect(controls).toEqual([0x01, 0x02, 0x03, 0x06]);
        expect(Array.from(row).every((b) => b <= 0x7f)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });
});
