// Tests for codec.ts (REQ-7)

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { encode, decode, CodecError } from '../src/codec.js';
import { createPage } from '../src/grid.js';

describe('Unit tests', () => {
  it('decode(encode(allSpacePage)) equals original', () => {
    const page = createPage(); // All 0x20
    const encoded = encode(page);
    const decoded = decode(encoded);
    
    expect(decoded).toEqual(page);
    expect(encoded.length).toBeLessThan(960); // Compression works
  });

  it('decode throws CodecError on invalid string', () => {
    expect(() => decode('')).toThrow(CodecError);
    expect(() => decode('!!!')).toThrow(CodecError);
  });

  it('all control bytes (0x00-0x1F)', () => {
    const page = createPage();
    for (let i = 0; i < 32; i++) {
      page[i] = i;
    }
    
    const encoded = encode(page);
    const decoded = decode(encoded);
    
    expect(decoded).toEqual(page);
  });

  it('all printable ASCII (0x20-0x7F)', () => {
    const page = createPage();
    for (let i = 0; i < 96; i++) {
      page[i] = 0x20 + (i % 96);
    }
    
    const encoded = encode(page);
    const decoded = decode(encoded);
    
    expect(decoded).toEqual(page);
  });

  it('long runs are compressed', () => {
    const page = createPage();
    // Fill with 100 consecutive spaces
    for (let i = 0; i < 100; i++) {
      page[i] = 0x20;
    }
    
    const encoded = encode(page);
    // Should be much shorter than 960 chars due to compression
    expect(encoded.length).toBeLessThan(500);
  });
});

describe('Property-based tests', () => {
  describe('REQ-7.1', () => {
    it('decode(encode(page)) is byte-for-byte identical', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 127 }),
          fc.array(fc.integer({ min: 0, max: 127 }), { minLength: 100, maxLength: 1000 }),
          (fixedByte, randomBytes) => {
            // Create a page with mostly one byte value, some variation
            const page = createPage();
            for (let i = 0; i < page.length; i++) {
              const b = i < randomBytes.length ? randomBytes[i] : fixedByte;
              page[i] = b;
            }
            
            const encoded = encode(page);
            const decoded = decode(encoded);
            
            expect(decoded.length).toBe(960);
            for (let i = 0; i < 960; i++) {
              expect(decoded[i]).toBe(page[i]);
            }
            
            return true;
          }
        )
      );
    });
  });

  describe('REQ-7.2', () => {
    it('encode(page) matches /^[A-Za-z0-9\-_.]+$/', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 127 }),
          fc.array(fc.integer({ min: 0, max: 127 }), { minLength: 100, maxLength: 1000 }),
          (fixedByte, randomBytes) => {
            const page = createPage();
            for (let i = 0; i < page.length; i++) {
              const b = i < randomBytes.length ? randomBytes[i] : fixedByte;
              page[i] = b;
            }
            
            const encoded = encode(page);
            expect(encoded).toMatch(/^[A-Za-z0-9\-_.]+$/);
            
            return true;
          }
        )
      );
    });
  });
});
