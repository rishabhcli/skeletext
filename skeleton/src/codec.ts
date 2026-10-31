// Codec for teletext pages (REQ-7)
// Uses RLE compression followed by base64url encoding

import type { RawPage } from './types.js';

// Error for invalid codec strings
export class CodecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CodecError';
  }
}

// Base64url alphabet (RFC 4648 §5, extended with .)
const BASE64_URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// Simple RLE encoding for pages
// Uses 0x80 as escape byte (outside 7-bit range for valid pages)
// - Literal byte b (any 7-bit value): emitted as-is
// - Run of k identical bytes b: emitted as 0x80, b, k (where k is 1-255)

// RLE encode a page into a Uint8Array
function rleEncode(page: RawPage): Uint8Array {
  const result: number[] = [];
  
  let i = 0;
  while (i < page.length) {
    const byte = page[i];
    let count = 1;
    
    // Count consecutive identical bytes
    while (i + count < page.length && page[i + count] === byte && count < 255) {
      count += 1;
    }
    
    if (count === 1) {
      // Literal byte
      result.push(byte);
    } else {
      // Run: escape byte, value, count
      result.push(0x80, byte, count);
    }
    
    i += count;
  }
  
  return new Uint8Array(result);
}

// RLE decode a Uint8Array back to a page
function rleDecode(data: Uint8Array, expectedLength: number): RawPage {
  const result = new Uint8Array(expectedLength);
  let outIdx = 0;
  let i = 0;
  
  while (i < data.length && outIdx < expectedLength) {
    const byte = data[i];
    
    if (byte === 0x80) {
      // Run: next byte is value, then count
      if (i + 2 >= data.length) {
        throw new CodecError('Invalid RLE: incomplete run at end');
      }
      const value = data[i + 1];
      const count = data[i + 2] as number;
      for (let j = 0; j < count && outIdx < expectedLength; j++) {
        result[outIdx++] = value;
      }
      i += 3;
    } else {
      // Literal byte
      result[outIdx++] = byte;
      i++;
    }
  }
  
  if (outIdx !== expectedLength) {
    throw new CodecError(`Invalid RLE: expected ${expectedLength} bytes, got ${outIdx}`);
  }
  
  return result;
}

// Encode a page to a URL-safe string
export function encode(page: RawPage): string {
  if (page.length !== 960) {
    throw new CodecError(`Expected 960 bytes, got ${page.length}`);
  }
  
  // RLE encode
  const rleData = rleEncode(page);
  
  // Base64url encode (no padding)
  let result = '';
  for (let i = 0; i < rleData.length; i += 3) {
    const b1 = rleData[i] as number;
    const b2 = i + 1 < rleData.length ? rleData[i + 1] as number : 0;
    const b3 = i + 2 < rleData.length ? rleData[i + 2] as number : 0;
    
    const chunk = (b1 << 16) | (b2 << 8) | b3;
    result += BASE64_URL[(chunk >> 18) & 0x3F];
    result += BASE64_URL[(chunk >> 12) & 0x3F];
    result += BASE64_URL[(chunk >> 6) & 0x3F];
    result += BASE64_URL[chunk & 0x3F];
  }
  
  return result;
}

// Decode a URL-safe string back to a page
export function decode(s: string): RawPage {
  // Validate non-empty
  if (s.length === 0) {
    throw new CodecError('Invalid codec string: empty');
  }
  
  // Check for optional version prefix (future-proofing)
  let data = s;
  if (s[0] === '.') {
    data = s.substring(1);
  }
  
  // Validate base64url characters
  if (!/^[A-Za-z0-9\-_.]+$/.test(data)) {
    throw new CodecError('Invalid codec string: contains invalid characters');
  }
  
  // Base64url decode
  const rleData: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    const c1 = data[i];
    const c2 = data[i + 1];
    const c3 = data[i + 2];
    const c4 = data[i + 3];
    
    if (c1 === undefined || c2 === undefined || c3 === undefined || c4 === undefined) {
      throw new CodecError('Invalid codec string: incomplete quadruplet');
    }
    
    const v1 = BASE64_URL.indexOf(c1);
    const v2 = BASE64_URL.indexOf(c2);
    const v3 = BASE64_URL.indexOf(c3);
    const v4 = BASE64_URL.indexOf(c4);
    
    if (v1 === -1 || v2 === -1 || v3 === -1 || v4 === -1) {
      throw new CodecError('Invalid codec string: invalid base64url character');
    }
    
    const chunk = (v1 << 18) | (v2 << 12) | (v3 << 6) | v4;
    rleData.push((chunk >> 16) & 0xFF);
    rleData.push((chunk >> 8) & 0xFF);
    rleData.push(chunk & 0xFF);
  }
  
  const rleArray = new Uint8Array(rleData);
  
  // RLE decode
  return rleDecode(rleArray, 960);
}
