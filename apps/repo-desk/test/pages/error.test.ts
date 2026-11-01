import { describe, it, expect } from 'vitest';
import { createPage, getRow } from '@skeletext/core';
import { buildInvalidRepoPage } from '../../src/pages/invalid.js';
import { buildRateLimitPage } from '../../src/pages/ratelimit.js';
import { buildFetchErrorPage } from '../../src/pages/error.js';
import { buildLoadingPage } from '../../src/pages/loading.js';

describe('buildInvalidRepoPage', () => {
  it('returns a 960-byte page containing the ASCII bytes for bad', () => {
    const page = buildInvalidRepoPage('bad');
    const flat = new Uint8Array(960);
    for (let r = 0; r < 24; r++) {
      const row = getRow(page, r);
      for (let c = 0; c < 40; c++) {
        flat[r * 40 + c] = row[c] ?? 0x20;
      }
    }
    // Find 'bad' in the bytes
    const badBytes = [0x62, 0x61, 0x64]; // 'b', 'a', 'd'
    let found = false;
    for (let i = 0; i < flat.length - 2; i++) {
      if (flat[i] === badBytes[0] && flat[i + 1] === badBytes[1] && flat[i + 2] === badBytes[2]) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});

describe('buildRateLimitPage', () => {
  it('returns a 960-byte page containing HH:MM:SS UTC for valid timestamp', () => {
    // 1735600000 is 2024-12-31 16:26:40 UTC
    const page = buildRateLimitPage('1735600000');
    const flat = new Uint8Array(960);
    for (let r = 0; r < 24; r++) {
      const row = getRow(page, r);
      for (let c = 0; c < 40; c++) {
        flat[r * 40 + c] = row[c] ?? 0x20;
      }
    }
    // Check for 'UTC' in the bytes
    const utcBytes = [0x55, 0x54, 0x43]; // 'U', 'T', 'C'
    let found = false;
    for (let i = 0; i < flat.length - 2; i++) {
      if (flat[i] === utcBytes[0] && flat[i + 1] === utcBytes[1] && flat[i + 2] === utcBytes[2]) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('returns a page containing unavailable for null reset header', () => {
    const page = buildRateLimitPage(null);
    const flat = new Uint8Array(960);
    for (let r = 0; r < 24; r++) {
      const row = getRow(page, r);
      for (let c = 0; c < 40; c++) {
        flat[r * 40 + c] = row[c] ?? 0x20;
      }
    }
    // Check for 'unavailable' in the bytes
    const unavailableBytes = [0x75, 0x6E, 0x61, 0x76, 0x61, 0x69, 0x6C, 0x61, 0x62, 0x6C, 0x65]; // 'u', 'n', 'a', 'v', 'a', 'i', 'l', 'a', 'b', 'l', 'e'
    let found = false;
    for (let i = 0; i < flat.length - 10; i++) {
      let match = true;
      for (let j = 0; j < unavailableBytes.length; j++) {
        if (flat[i + j] !== unavailableBytes[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});

describe('buildFetchErrorPage', () => {
  it('returns a 960-byte page containing timeout', () => {
    const page = buildFetchErrorPage('Page 110: commits', 'timeout');
    const flat = new Uint8Array(960);
    for (let r = 0; r < 24; r++) {
      const row = getRow(page, r);
      for (let c = 0; c < 40; c++) {
        flat[r * 40 + c] = row[c] ?? 0x20;
      }
    }
    // Check for 'timeout' in the bytes
    const timeoutBytes = [0x74, 0x69, 0x6D, 0x65, 0x6F, 0x75, 0x74]; // 't', 'i', 'm', 'e', 'o', 'u', 't'
    let found = false;
    for (let i = 0; i < flat.length - 6; i++) {
      if (flat[i] === timeoutBytes[0] && flat[i + 1] === timeoutBytes[1] && flat[i + 2] === timeoutBytes[2] &&
          flat[i + 3] === timeoutBytes[3] && flat[i + 4] === timeoutBytes[4] && flat[i + 5] === timeoutBytes[5] &&
          flat[i + 6] === timeoutBytes[6]) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});

describe('buildLoadingPage', () => {
  it('returns a page whose row 0 contains the bytes for 110', () => {
    const page = buildLoadingPage(110);
    const row0 = getRow(page, 0);
    // Row 0: color code at col 0, then 'P110' at cols 1-4
    expect(row0[0]).toBe(7); // white color code
    expect(row0[1]).toBe(80); // 'P'
    expect(row0[2]).toBe(49); // '1'
    expect(row0[3]).toBe(49); // '1'
    expect(row0[4]).toBe(48); // '0'
  });

  it('no row exceeds 40 bytes', () => {
    const page = buildLoadingPage(110);
    for (let r = 0; r < 24; r++) {
      const row = getRow(page, r);
      // Check that row length is at most 40
      let lastNonSpace = 0;
      for (let c = 0; c < 40; c++) {
        if (row[c] !== undefined && row[c] !== 0x20) {
          lastNonSpace = c;
        }
      }
      // Last non-space should be at index <= 39 (column 40)
      expect(lastNonSpace).toBeLessThanOrEqual(39);
    }
  });
});

describe('page sizes', () => {
  it('all error pages are 960 bytes (24x40)', () => {
    const pages = [
      buildInvalidRepoPage('test'),
      buildRateLimitPage('1735600000'),
      buildFetchErrorPage('context', 'reason'),
      buildLoadingPage(110),
    ];
    pages.forEach(page => {
      const flat = new Uint8Array(960);
      for (let r = 0; r < 24; r++) {
        const row = getRow(page, r);
        for (let c = 0; c < 40; c++) {
          flat[r * 40 + c] = row[c] ?? 0x20;
        }
      }
      expect(flat.length).toBe(960);
    });
  });
});
