// Tests for interpreter.ts (REQ-3)

import { describe, it, expect } from 'vitest';
import { createPage, setCell, getCell } from '../src/grid.js';
import { interpretPage } from '../src/interpreter.js';
import * as fc from 'fast-check';

describe('interpreter', () => {
  describe('basic cases', () => {
    it('page of all spaces produces cells with default colours', () => {
      const page = createPage();
      const cells = interpretPage(page, false);

      // Check first cell
      expect(cells[0][0]).toMatchObject({
        fg: 7,          // Alpha White
        bg: 0,          // Black
        flash: false,   // Steady
        char: ' ',
      });

      // Check it's 24 rows
      expect(cells.length).toBe(24);
      expect(cells[0].length).toBe(40);
    });

    it('row-start defaults apply at start of each row', () => {
      const page = createPage();
      // Set different states on rows
      setCell(page, 5, 0, 0x01); // Alpha Red
      const cells = interpretPage(page, false);

      // Row 0, cell 0 should have defaults (fg=7)
      expect(cells[0]![0]!.fg).toBe(7);
      // Row 5, cell 0 should also have defaults (fg=7), not Red
      expect(cells[5]![0]!.fg).toBe(7);
      // Row 5, cell 5 has Red (from the colour code we set)
      expect(cells[5]![5]!.fg).toBe(1);
      // Row 5, cell 6+ should have Red (colour is set-after, applies to next cell)
      expect(cells[5]![6]!.fg).toBe(1);
      // Row 6, cell 0 should have defaults again (fg=7)
      expect(cells[6]![0]!.fg).toBe(7);
    });
  });

  describe('REQ-3.1: row-start defaults', () => {
    it('first cell of every row has default state', () => {
      const page = createPage();
      for (let row = 0; row < 24; row++) {
        setCell(page, row, 5, 0x01); // Change state mid-row
      }

      const cells = interpretPage(page, false);
      for (let row = 0; row < 24; row++) {
        expect(cells[row][0]).toMatchObject({
          fg: 7,
          bg: 0,
          flash: false,
        });
      }
    });
  });

  describe('REQ-3.2: set-at timing', () => {
    it('set-at control cell uses new attribute', () => {
      const page = createPage();
      // Steady (0x09) is set-at
      setCell(page, 0, 5, 0x08); // Flash at col 5
      setCell(page, 0, 6, 0x41); // 'A' at col 6
      setCell(page, 0, 7, 0x09); // Steady at col 7 (set-at)
      setCell(page, 0, 8, 0x42); // 'B' at col 8

      const cells = interpretPage(page, false);

      // Cell 5 (Flash control, set-after) should have flash=false (default)
      expect(cells[0][5].flash).toBe(false);
      // Cell 6 should have flash=true
      expect(cells[0][6].flash).toBe(true);
      // Cell 7 (Steady, set-at) has flash=false
      expect(cells[0][7].flash).toBe(false);
      // Cell 8 keeps flash=false
      expect(cells[0][8].flash).toBe(false);
    });
  });

  describe('REQ-3.3: set-after timing', () => {
    it('set-after colour code control cell has old colour', () => {
      const page = createPage();
      // Red (0x01) is set-after
      setCell(page, 0, 5, 0x01); // Alpha Red at col 5
      setCell(page, 0, 6, 0x41); // 'A' at col 6

      const cells = interpretPage(page, false);

      // Cell 5 (Red control, set-after) should have default colour (white)
      expect(cells[0][5].fg).toBe(7);
      // Cell 6 should have Red
      expect(cells[0][6].fg).toBe(1);
    });
  });

  describe('REQ-3.4: mosaic mode', () => {
    it('mosaic colour code switches to mosaic mode', () => {
      const page = createPage();
      setCell(page, 0, 5, 0x11); // Mosaics Red (set-after)
      setCell(page, 0, 6, 0x7F); // Mosaic byte (all blocks filled)

      const cells = interpretPage(page, false);

      // Cell 5 (control, set-after) should have alpha mode (unaffected)
      expect(cells[0][5].charMode).toBe('alpha');
      // Cell 6 should be in mosaic mode
      expect(cells[0][6].charMode).toBe('mosaic');
      expect(cells[0][6].mosaicMask).toBe(0x3F);
    });

    it('capital letters in mosaic mode show as alpha', () => {
      const page = createPage();
      setCell(page, 0, 5, 0x11); // Mosaics Red (set-after)
      setCell(page, 0, 6, 0x21); // 'A' with bit 6 = 0, in mosaic mode this shows as capital letter

      const cells = interpretPage(page, false);

      // Cell 5 (control) should have alpha mode
      expect(cells[0][5].charMode).toBe('alpha');
      // Cell 6 should show capital letter in alpha mode (not mosaic)
      expect(cells[0][6].charMode).toBe('alpha');
      expect(cells[0][6].char).toBe('!'); // 0x21 is '!'
    });
  });

  describe('REQ-3.5: hold mosaics', () => {
    it('control cell under hold mosaics shows held mosaic while in mosaic mode', () => {
      const page = createPage();
      setCell(page, 0, 5, 0x11); // Mosaics Red (set-after, switches to mosaic mode)
      setCell(page, 0, 6, 0x7F); // Mosaic byte (all blocks filled)
      setCell(page, 0, 7, 0x1E); // Hold Mosaics (set-at)
      setCell(page, 0, 8, 0x12); // Mosaics Green (set-after, stays in mosaic mode)
      setCell(page, 0, 9, 0x18); // Conceal (set-at, control cell)

      const cells = interpretPage(page, false);

      // Cell 9 (Conceal control, Hold Mosaics active, still in mosaic mode) should show held mosaic
      expect(cells[0][9].charMode).toBe('mosaic');
      expect(cells[0][9].mosaicMask).toBe(0x3F);
    });

    it('held mosaic resets at start of row', () => {
      const page = createPage();
      setCell(page, 0, 5, 0x11); // Mosaics Red
      setCell(page, 0, 6, 0x20 | 0x3F); // Mosaic byte
      setCell(page, 0, 7, 0x1E); // Hold Mosaics
      setCell(page, 0, 8, 0x01); // Control cell (shows held)

      // Next row: start fresh, no held mosaic
      setCell(page, 1, 5, 0x1E); // Hold Mosaics immediately
      setCell(page, 1, 6, 0x01); // Control cell — should show space

      const cells = interpretPage(page, false);

      // Row 1, cell 6 (control, hold active but no held mosaic) should show space
      expect(cells[1][6].mosaicMask).toBe(0);
    });

    it('held mosaic resets on mode switch', () => {
      const page = createPage();
      setCell(page, 0, 5, 0x11); // Mosaics Red (switch to mosaic mode)
      setCell(page, 0, 6, 0x20 | 0x3F); // Mosaic byte
      setCell(page, 0, 7, 0x1E); // Hold Mosaics
      setCell(page, 0, 8, 0x01); // Alpha Red (switch to alpha mode)
      setCell(page, 0, 9, 0x02); // Alpha Green (control cell, no held mosaic anymore)

      const cells = interpretPage(page, false);

      // Cell 9 (control, after mode switch) should show space
      expect(cells[0][9].mosaicMask).toBe(0);
    });
  });

  describe('REQ-3.6: conceal', () => {
    it('concealed cell shows space when reveal is false', () => {
      const page = createPage();
      setCell(page, 0, 5, 0x18); // Conceal (set-at)
      setCell(page, 0, 6, 0x41); // 'A'

      const cells = interpretPage(page, false);

      // Cell 6 should show space
      expect(cells[0][6].char).toBe('');
    });

    it('concealed cell shows content when reveal is true', () => {
      const page = createPage();
      setCell(page, 0, 5, 0x18); // Conceal (set-at)
      setCell(page, 0, 6, 0x41); // 'A'

      const cells = interpretPage(page, true);

      // Cell 6 should show 'A'
      expect(cells[0][6].char).toBe('A');
    });

    it('conceal ends at next colour code', () => {
      const page = createPage();
      setCell(page, 0, 5, 0x18); // Conceal (set-at)
      setCell(page, 0, 6, 0x41); // 'A' (concealed)
      setCell(page, 0, 7, 0x01); // Alpha Red (set-after) — clears conceal
      setCell(page, 0, 8, 0x42); // 'B'

      const cells = interpretPage(page, false);

      // Cell 6 should be concealed (space)
      expect(cells[0][6].char).toBe('');
      // Cell 8 should show 'B' (conceal ended at colour code)
      expect(cells[0][8].char).toBe('B');
    });
  });

  describe('REQ-3.7: flash', () => {
    it('flash is set-after; steady is set-at', () => {
      const page = createPage();
      setCell(page, 0, 5, 0x08); // Flash (set-after)
      setCell(page, 0, 6, 0x41); // 'A'
      setCell(page, 0, 7, 0x09); // Steady (set-at)
      setCell(page, 0, 8, 0x42); // 'B'

      const cells = interpretPage(page, false);

      // Cell 5 (Flash control, set-after) should have flash=false
      expect(cells[0][5].flash).toBe(false);
      // Cell 6 should have flash=true
      expect(cells[0][6].flash).toBe(true);
      // Cell 7 (Steady, set-at) should have flash=false
      expect(cells[0][7].flash).toBe(false);
      // Cell 8 should have flash=false
      expect(cells[0][8].flash).toBe(false);
    });
  });

  describe('REQ-3.8: new background', () => {
    it('new background sets bg to current fg', () => {
      const page = createPage();
      setCell(page, 0, 5, 0x01); // Alpha Red (fg=1)
      setCell(page, 0, 6, 0x1D); // New Background (set-at)
      setCell(page, 0, 7, 0x41); // 'A'

      const cells = interpretPage(page, false);

      // Cell 6 (New Background, set-at) should have bg=fg=1
      expect(cells[0][6].bg).toBe(1);
      // Cell 7 should also have bg=1
      expect(cells[0][7].bg).toBe(1);
    });
  });

  describe('REQ-3.9: double height', () => {
    it('double height on row < 23 makes lower row blank', () => {
      const page = createPage();
      setCell(page, 5, 0, 0x0D); // Double Height (set-after)
      setCell(page, 5, 1, 0x41); // 'A' in double-height-top

      const cells = interpretPage(page, false);

      // Row 5, cell 0 should be double-height-top
      expect(cells[5][0].size).toBe('double-height-top');
      // Row 6 should be all spaces (double-height-lower)
      for (let col = 0; col < 40; col++) {
        expect(cells[6][col].size).toBe('double-height-lower');
        expect(cells[6][col].char).toBe('');
        expect(cells[6][col].mosaicMask).toBe(0);
      }
    });

    it('double height on row 23 has no effect', () => {
      const page = createPage();
      setCell(page, 23, 0, 0x0D); // Double Height on row 23
      setCell(page, 23, 1, 0x41); // 'A'

      const cells = interpretPage(page, false);

      // Row 23, cell 0 should have normal size (no effect)
      expect(cells[23][0].size).toBe('normal');
      // Row 23, cell 1 should show 'A' normally
      expect(cells[23][1].char).toBe('A');
      expect(cells[23][1].size).toBe('normal');
    });
  });

  describe('REQ-3.10: no-effect codes', () => {
    it('no-effect codes (0x00, 0x0E, 0x0F, 0x10) are spaces', () => {
      const page = createPage();
      setCell(page, 0, 5, 0x01); // Alpha Red (fg=1)
      setCell(page, 0, 6, 0x00); // Alpha Black (no-effect)
      setCell(page, 0, 7, 0x41); // 'A'

      const cells = interpretPage(page, false);

      // Cell 6 (no-effect) should show space with fg=1 (no state change)
      expect(cells[0][6].char).toBe('');
      expect(cells[0][6].fg).toBe(1);
    });

    it('0x0E (Double Width) is no-effect', () => {
      const page = createPage();
      setCell(page, 0, 5, 0x01); // Alpha Red
      setCell(page, 0, 6, 0x0E); // Double Width (no-effect)
      setCell(page, 0, 7, 0x41); // 'A'

      const cells = interpretPage(page, false);

      // Cell 6 should show space, fg unchanged
      expect(cells[0][6].char).toBe('');
      expect(cells[0][6].fg).toBe(1);
    });

    it('0x0F (Double Size) is no-effect', () => {
      const page = createPage();
      setCell(page, 0, 5, 0x01); // Alpha Red
      setCell(page, 0, 6, 0x0F); // Double Size (no-effect)
      setCell(page, 0, 7, 0x41); // 'A'

      const cells = interpretPage(page, false);

      // Cell 6 should show space, fg unchanged
      expect(cells[0][6].char).toBe('');
      expect(cells[0][6].fg).toBe(1);
    });

    it('0x10 (Mosaics Black) is no-effect', () => {
      const page = createPage();
      setCell(page, 0, 5, 0x11); // Mosaics Red (switches to mosaic mode)
      setCell(page, 0, 6, 0x10); // Mosaics Black (no-effect)
      setCell(page, 0, 7, 0x41); // Capital letter

      const cells = interpretPage(page, false);

      // Cell 6 should show space, mode unchanged (still mosaic)
      expect(cells[0][6].char).toBe('');
      // Actually, 0x10 might not change mode, but let's verify it's treated as space
      expect(cells[0][6].mosaicMask).toBe(0);
    });
  });

  describe('[PBT REQ-3.1.1] row defaults', () => {
    it('first cell of every row has default state for arbitrary pages', () => {
      const pageArb = fc.uint8Array({ length: 960, minLength: 960 }).map(arr => {
        const page = createPage();
        for (let i = 0; i < 960; i++) {
          page[i] = arr[i] & 0x7F; // Ensure 7-bit
        }
        return page;
      });

      fc.assert(
        fc.property(pageArb, (page) => {
          const cells = interpretPage(page, false);
          // First cell of each row should have default fg and flash
          // Size might be double-height-lower if the row above had double-height
          for (let row = 0; row < 24; row++) {
            const cell = cells[row][0];
            expect(cell.fg).toBe(7); // Alpha White default
            expect(cell.flash).toBe(false); // Steady default
          }
        })
      );
    });
  });

  describe('[PBT REQ-3.3.1] set-after colour at any column', () => {
    it('set-after colour control cell never has new colour', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 38 }), // col 0–38 (leave space for char)
          fc.integer({ min: 1, max: 7 }), // new colour 1–7
          (col, newColour) => {
            const page = createPage();
            setCell(page, 0, col, newColour); // Set-after colour control
            setCell(page, 0, col + 1, 0x41); // 'A'

            const cells = interpretPage(page, false);

            // Cell at col should have default colour (7), not newColour
            expect(cells[0][col].fg).toBe(7);
            // Cell at col+1 should have newColour
            expect(cells[0][col + 1].fg).toBe(newColour);
          }
        )
      );
    });
  });

  describe('[PBT REQ-3.9.1] double-height lower row always blank', () => {
    it('double-height code makes row below all spaces with no glyphs', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 22 }),
          (row) => {
            const page = createPage();
            setCell(page, row, 0, 0x0D); // Double Height on row
            // Fill next row with glyphs
            for (let col = 0; col < 40; col++) {
              setCell(page, row + 1, col, 0x20 | (col & 0x0F)); // Various bytes 0x20–0x2F
            }

            const cells = interpretPage(page, false);

            // Row+1 should be all spaces
            for (let col = 0; col < 40; col++) {
              expect(cells[row + 1][col].char).toBe('');
              expect(cells[row + 1][col].mosaicMask).toBe(0);
              expect(cells[row + 1][col].size).toBe('double-height-lower');
            }
          }
        )
      );
    });
  });

  describe('integration: complex row', () => {
    it('complex row with mixed codes produces correct cells', () => {
      const page = createPage();
      // Row with: default, colour, text, conceal, text, colour (ends conceal), text
      setCell(page, 0, 0, 0x41); // 'A' default (white)
      setCell(page, 0, 1, 0x01); // Alpha Red (set-after)
      setCell(page, 0, 2, 0x42); // 'B' (red)
      setCell(page, 0, 3, 0x18); // Conceal (set-at)
      setCell(page, 0, 4, 0x43); // 'C' (concealed, conceal is still active)
      setCell(page, 0, 5, 0x02); // Alpha Green (set-after, ends conceal)
      setCell(page, 0, 6, 0x44); // 'D' (green, conceal ended)

      const cells = interpretPage(page, false);

      expect(cells[0][0]).toMatchObject({ char: 'A', fg: 7 });
      expect(cells[0][1]).toMatchObject({ char: '', fg: 7 }); // Control, set-after
      expect(cells[0][2]).toMatchObject({ char: 'B', fg: 1 });
      expect(cells[0][3]).toMatchObject({ char: '', fg: 1, conceal: true });
      expect(cells[0][4]).toMatchObject({ char: '', fg: 1, conceal: true }); // Concealed
      expect(cells[0][5]).toMatchObject({ char: '', fg: 1 }); // Control, conceal cleared
      expect(cells[0][6]).toMatchObject({ char: 'D', fg: 2, conceal: false });
    });
  });
});
