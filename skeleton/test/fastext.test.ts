// Tests for fastext.ts (REQ-6)

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { fillPromptRow, handleFastextKey, type FastextConfig } from '../src/fastext.js';

describe('handleFastextKey', () => {
  it('with an absent link returns null', () => {
    const config: FastextConfig = {
      red: null,
      green: null,
      yellow: null,
      cyan: null,
      index: null,
    };
    
    expect(handleFastextKey(config, 'red')).toBeNull();
    expect(handleFastextKey(config, 'green')).toBeNull();
    expect(handleFastextKey(config, 'yellow')).toBeNull();
    expect(handleFastextKey(config, 'cyan')).toBeNull();
    expect(handleFastextKey(config, 'index')).toBeNull();
  });

  it('handles all keys correctly', () => {
    const config: FastextConfig = {
      red: 100,
      green: 110,
      yellow: 140,
      cyan: 150,
      index: 199,
    };
    
    expect(handleFastextKey(config, 'red')).toBe(100);
    expect(handleFastextKey(config, 'green')).toBe(110);
    expect(handleFastextKey(config, 'yellow')).toBe(140);
    expect(handleFastextKey(config, 'cyan')).toBe(150);
    expect(handleFastextKey(config, 'index')).toBe(199);
  });
});

describe('fillPromptRow', () => {
  it('contains the four colour control bytes', () => {
    const labels = { red: '100', green: '110', yellow: '140', cyan: '150' };
    const row = fillPromptRow({ red: 100, green: 110, yellow: 140, cyan: 150, index: null }, labels);
    
    expect(row[0]).toBe(0x01);  // red
    expect(row[10]).toBe(0x02); // green
    expect(row[20]).toBe(0x03); // yellow
    expect(row[30]).toBe(0x06); // cyan
  });

  it('returns exactly 40 bytes', () => {
    const labels = { red: '100', green: '110', yellow: '140', cyan: '150' };
    const row = fillPromptRow({ red: 100, green: 110, yellow: 140, cyan: 150, index: null }, labels);
    
    expect(row.length).toBe(40);
  });

  it('fills remaining space with spaces (0x20)', () => {
    const labels = { red: '1', green: '2', yellow: '3', cyan: '4' };
    const row = fillPromptRow({ red: 100, green: 110, yellow: 140, cyan: 150, index: null }, labels);
    
    // Check that unused positions are spaces
    expect(row[2]).toBe(0x20); // after '1'
    expect(row[12]).toBe(0x20); // after '2'
  });

  describe('REQ-6.1', () => {
    it('returns exactly 40 bytes for arbitrary config', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          (r, g, y, c) => {
            const labels = { red: r, green: g, yellow: y, cyan: c };
            const config: FastextConfig = {
              red: 100,
              green: 110,
              yellow: 140,
              cyan: 150,
              index: 199,
            };
            const row = fillPromptRow(config, labels);
            expect(row.length).toBe(40);
            return true;
          }
        )
      );
    });
  });
});
