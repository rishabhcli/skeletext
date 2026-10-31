import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createPage, setCell, getCell } from '../src/grid.js';
import { interpretPage } from '../src/interpreter.js';
import { encodeBlockMask } from '../src/mosaic.js';
import type { RawPage } from '../src/types.js';

// These tests were written by hand after review of the Kiro-generated first
// version (see docs/review-notes/). They cover REQ-3 and the review findings.

function pageWith(row: number, bytes: number[], col = 0): RawPage {
  const page = createPage();
  bytes.forEach((b, i) => setCell(page, row, col + i, b));
  return page;
}

const anyPage = fc
  .uint8Array({ minLength: 960, maxLength: 960 })
  .map((a) => a.map((x) => x & 0x7f) as RawPage);

const withoutDoubleHeight = (p: RawPage): RawPage => p.map((x) => (x === 0x0d ? 0x20 : x)) as RawPage;

const colourCode = fc.oneof(fc.integer({ min: 0x01, max: 0x07 }), fc.integer({ min: 0x11, max: 0x17 }));
const colourOf = (code: number) => (code >= 0x11 ? code - 0x10 : code);

describe('REQ-3 display interpreter: shape and defaults', () => {
  it('blank page gives 24 x 40 default cells', () => {
    const cells = interpretPage(createPage());
    expect(cells.length).toBe(24);
    for (const row of cells) {
      expect(row.length).toBe(40);
      for (const c of row) {
        expect(c).toMatchObject({ char: ' ', fg: 7, bg: 0, flash: false, conceal: false, size: 'normal', charMode: 'alpha', mosaicMask: 0 });
      }
    }
  });

  it('[PBT REQ-3.0] every page gives exactly 24 rows of 40 cells and the input is not modified', () => {
    fc.assert(
      fc.property(anyPage, fc.boolean(), (page, reveal) => {
        const copy = page.slice();
        const cells = interpretPage(page, reveal);
        expect(page).toEqual(copy);
        expect(cells.length).toBe(24);
        expect(cells.every((r) => r.length === 40)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('[PBT REQ-3.1.1] a printable first byte in every row starts from the row defaults', () => {
    fc.assert(
      fc.property(anyPage, (page) => {
        for (let r = 0; r < 24; r++) setCell(page, r, 0, 0x41);
        const cells = interpretPage(page);
        for (let r = 0; r < 24; r++) {
          const c = cells[r]![0]!;
          expect(c.fg).toBe(7);
          expect(c.bg).toBe(0);
          expect(c.flash).toBe(false);
          expect(c.conceal).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('[PBT REQ-3.1.2] no attribute leaks between rows: a row looks the same alone as inside any page', () => {
    fc.assert(
      fc.property(anyPage, fc.integer({ min: 0, max: 23 }), (raw, r) => {
        const page = withoutDoubleHeight(raw);
        const alone = createPage();
        for (let c = 0; c < 40; c++) setCell(alone, r, c, getCell(page, r, c));
        expect(interpretPage(page)[r]).toEqual(interpretPage(alone)[r]);
      }),
      { numRuns: 200 },
    );
  });
});

describe('REQ-3.2 and REQ-3.3 set-at and set-after timing', () => {
  it('set-after colour code: its own cell keeps the old colour, the next cell takes the new one', () => {
    const cells = interpretPage(pageWith(3, [0x41, 0x01, 0x42]));
    expect(cells[3]![1]!.fg).toBe(7);
    expect(cells[3]![2]!.fg).toBe(1);
  });

  it('[PBT REQ-3.3.1] for any colour code at any column the code cell keeps the old colour and the next cell shows the new one', () => {
    fc.assert(
      fc.property(colourCode, fc.integer({ min: 0, max: 22 }), fc.integer({ min: 0, max: 38 }), (code, row, col) => {
        const cells = interpretPage(pageWith(row, [code, 0x58], col));
        expect(cells[row]![col]!.fg).toBe(7);
        expect(cells[row]![col + 1]!.fg).toBe(colourOf(code));
      }),
      { numRuns: 200 },
    );
  });

  it('set-at New Background: the code cell itself already has the new background', () => {
    const cells = interpretPage(pageWith(1, [0x04, 0x1d, 0x58, 0x1c, 0x59]));
    expect(cells[1]![1]!).toMatchObject({ fg: 4, bg: 4 });
    expect(cells[1]![2]!).toMatchObject({ fg: 4, bg: 4, char: 'X' });
    expect(cells[1]![3]!.bg).toBe(0); // Black Background is also set-at
    expect(cells[1]![4]!.bg).toBe(0);
  });

  it('Flash is set-after and Steady is set-at', () => {
    const cells = interpretPage(pageWith(0, [0x08, 0x41, 0x09, 0x42]));
    expect(cells[0]!.map((c) => c.flash).slice(0, 4)).toEqual([false, true, false, false]);
  });
});

describe('REQ-3.4 mosaic mode and REQ-4 round trip', () => {
  it('[PBT REQ-3.4.1] every block mask survives encode then interpret in mosaic mode', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 63 }), fc.integer({ min: 0x11, max: 0x17 }), (mask, code) => {
        const cell = interpretPage(pageWith(2, [code, encodeBlockMask(mask)]))[2]![1]!;
        expect(cell.charMode).toBe('mosaic');
        expect(cell.mosaicMask).toBe(mask);
        expect(cell.fg).toBe(colourOf(code));
      }),
    );
  });

  it('[PBT REQ-3.4.2] bytes 0x40 to 0x5F stay capital letters and symbols in mosaic mode', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0x40, max: 0x5f }), (b) => {
        const cell = interpretPage(pageWith(2, [0x11, b]))[2]![1]!;
        expect(cell.charMode).toBe('alpha');
        expect(cell.char).toBe(String.fromCharCode(b));
      }),
    );
  });

  it('without a mosaic colour code the same byte is plain text', () => {
    const cell = interpretPage(pageWith(2, [0x21]))[2]![0]!;
    expect(cell.charMode).toBe('alpha');
    expect(cell.char).toBe('!');
  });

  it('separated and contiguous codes are set-at and recorded on mosaic cells', () => {
    const cells = interpretPage(pageWith(0, [0x11, 0x1a, 0x7f, 0x19, 0x7f]))[0]!;
    expect(cells[2]!.separated).toBe(true);
    expect(cells[4]!.separated).toBe(false);
  });
});

describe('REQ-3.5 hold mosaics', () => {
  it('a control cell under Hold shows the held mosaic, including the Release cell, but not the one after it', () => {
    const m = encodeBlockMask(0b101010);
    // 0x11 mosaic red, mosaic, 0x1E hold, 0x12 mosaic green, 0x1F release, 0x13 mosaic yellow
    const cells = interpretPage(pageWith(0, [0x11, m, 0x1e, 0x12, 0x1f, 0x13]))[0]!;
    expect(cells[2]!.mosaicMask).toBe(0b101010); // Hold is set-at, shows immediately
    expect(cells[3]!.mosaicMask).toBe(0b101010); // colour code under hold
    expect(cells[3]!.fg).toBe(1); // set-after: old colour on its own cell
    expect(cells[4]!.mosaicMask).toBe(0b101010); // Release is set-after: still held on its own cell
    expect(cells[5]!.mosaicMask).toBe(0); // hold is over
  });

  it('[PBT REQ-3.5.1] the held mosaic keeps its original separated form', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 63 }), (mask) => {
        // separated mosaic, then contiguous set-at, then hold: the held cell stays separated
        const cells = interpretPage(pageWith(0, [0x11, 0x1a, encodeBlockMask(mask), 0x19, 0x1e]))[0]!;
        expect(cells[4]!.mosaicMask).toBe(mask);
        expect(cells[4]!.separated).toBe(true);
      }),
    );
  });

  it('the held mosaic resets at the start of a row and when the mode changes', () => {
    const m = encodeBlockMask(63);
    const page = pageWith(0, [0x11, m, 0x1e, 0x01, 0x1e, 0x20]);
    setCell(page, 1, 0, 0x1e);
    const cells = interpretPage(page);
    expect(cells[1]![0]!.mosaicMask).toBe(0); // new row, nothing held
    // 0x01 Alpha Red switches to text mode and clears the held mosaic
    expect(cells[0]![4]!.mosaicMask).toBe(0);
  });
});

describe('REQ-3.6 conceal and reveal', () => {
  it('conceal hides text until reveal, and a colour code ends it', () => {
    const page = pageWith(0, [0x18, 0x41, 0x42, 0x02, 0x43]);
    const hidden = interpretPage(page, false)[0]!;
    expect(hidden[1]!).toMatchObject({ char: ' ', conceal: true });
    expect(hidden[2]!).toMatchObject({ char: ' ', conceal: true });
    expect(hidden[4]!).toMatchObject({ char: 'C', conceal: false });
    const shown = interpretPage(page, true)[0]!;
    expect(shown[1]!.char).toBe('A');
    expect(shown[1]!.conceal).toBe(false);
  });

  it('[PBT REQ-3.6.1] reveal=true never reports concealed cells, and unconcealed cells are identical either way', () => {
    fc.assert(
      fc.property(anyPage, (page) => {
        const off = interpretPage(page, false);
        const on = interpretPage(page, true);
        for (let r = 0; r < 24; r++) {
          for (let c = 0; c < 40; c++) {
            expect(on[r]![c]!.conceal).toBe(false);
            if (!off[r]![c]!.conceal) expect(off[r]![c]).toEqual(on[r]![c]);
          }
        }
      }),
      { numRuns: 150 },
    );
  });
});

describe('REQ-3.9 double height', () => {
  it('[PBT REQ-3.9.1] the row below a double-height code shows only the background of the cells above it', () => {
    fc.assert(
      fc.property(anyPage, fc.integer({ min: 0, max: 21 }), fc.integer({ min: 0, max: 39 }), (raw, row, col) => {
        const page = withoutDoubleHeight(raw);
        setCell(page, row, col, 0x0d);
        const cells = interpretPage(page);
        for (let c = 0; c < 40; c++) {
          const cell = cells[row + 1]![c]!;
          expect(cell.char).toBe(' ');
          expect(cell.mosaicMask).toBe(0);
          expect(cell.flash).toBe(false);
          expect(cell.bg).toBe(cells[row]![c]!.bg);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('cells after a Double Height code are double-height-top, the code cell itself is normal (set-after)', () => {
    const cells = interpretPage(pageWith(1, [0x0d, 0x41, 0x42]));
    expect(cells[1]![0]!.size).toBe('normal');
    expect(cells[1]![1]!.size).toBe('double-height-top');
    expect(cells[2]![1]!.size).toBe('double-height-lower');
    // the data written on row 2 is ignored
    const page = pageWith(1, [0x0d, 0x41]);
    setCell(page, 2, 5, 0x5a);
    expect(interpretPage(page)[2]![5]!.char).toBe(' ');
  });

  it('REQ-3.9.2 Double Height on row 23 has no effect', () => {
    const cells = interpretPage(pageWith(23, [0x0d, 0x41]));
    expect(cells[23]!.every((c) => c.size === 'normal')).toBe(true);
    expect(cells[23]![1]!.char).toBe('A');
  });

  it('Normal Size is set-at and ends double height on its own cell', () => {
    const cells = interpretPage(pageWith(4, [0x0d, 0x41, 0x0c, 0x42]));
    expect(cells[4]![1]!.size).toBe('double-height-top');
    expect(cells[4]![2]!.size).toBe('normal');
    expect(cells[4]![3]!.size).toBe('normal');
  });
});

describe('REQ-3.10 codes with no effect at Level 1', () => {
  it('[PBT REQ-3.10.1] 0x00, 0x0E, 0x0F and 0x10 give exactly the same page as 0x20', () => {
    fc.assert(
      fc.property(anyPage, fc.integer({ min: 0, max: 959 }), fc.constantFrom(0x00, 0x0e, 0x0f, 0x10), (page, index, code) => {
        const a = page.slice() as RawPage;
        const b = page.slice() as RawPage;
        a[index] = code;
        b[index] = 0x20;
        expect(interpretPage(a)).toEqual(interpretPage(b));
      }),
      { numRuns: 200 },
    );
  });
});
