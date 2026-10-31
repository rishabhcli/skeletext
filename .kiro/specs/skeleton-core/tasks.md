# skeleton-core tasks

Implementation checklist for the `skeleton/` package. Each task is small and independently verifiable. Every implementation task is paired with a test task. Property-based tests use Vitest + fast-check and cover all [PBT]-tagged acceptance criteria.

Tasks are ordered so that each module can be implemented and tested before the modules that depend on it.

---

## Phase 0 — Project scaffold

- [ ] **T-0.1** Create `skeleton/package.json` with `name: "skeleton"`, `type: "module"`, `exports: "./src/index.ts"`, and devDependencies for `vitest` and `fast-check`. No runtime dependencies.
- [ ] **T-0.2** Create `skeleton/tsconfig.json` with `strict: true`, `target: "ES2022"`, `module: "NodeNext"`, and `moduleResolution: "NodeNext"`.
- [ ] **T-0.3** Add a `vitest.config.ts` at `skeleton/` root that includes `skeleton/test/**/*.test.ts`.

---

## Phase 1 — Shared types

- [ ] **T-1.1** Implement `skeleton/src/types.ts`: define and export `RawPage`, `RawRow`, `Colour`, `Size`, `CharMode` as described in design §2. No logic, no tests needed for types alone.

---

## Phase 2 — Cell model (`grid.ts`) — REQ-1

- [ ] **T-2.1** Implement `createPage`, `getCell`, `setCell`, `getRow`, and the constants `HEADER_ROW = 0` and `PROMPT_ROW = 23` in `skeleton/src/grid.ts`. Bounds checks throw `RangeError`; byte values outside 0–127 are rejected at write time.
- [ ] **T-2.2** Write `skeleton/test/grid.test.ts`:
  - Unit: `createPage` returns a 960-byte Uint8Array of 0x20.
  - Unit: `getCell`/`setCell` round-trip at corners (0,0), (0,39), (23,0), (23,39).
  - Unit: `setCell` throws `RangeError` for byte 0x80 and for out-of-range row/col.
  - **[PBT REQ-1.1]** `fc.integer({min:0,max:23})` × `fc.integer({min:0,max:39})` × `fc.integer({min:0,max:127})`: setCell then getCell returns the same byte; page length is always 960.

---

## Phase 3 — Control code table (`codes.ts`) — REQ-2

- [ ] **T-3.1** Implement `CONTROL_CODES`, `ROW_DEFAULTS`, `isSetAt`, `isControlByte` in `skeleton/src/codes.ts`. The 32 entries are defined literally from the ETS 300 706 reference.
- [ ] **T-3.2** Write `skeleton/test/codes.test.ts`:
  - Unit: `CONTROL_CODES` has exactly 32 entries (REQ-2.1).
  - Unit: the set-at bytes are exactly `[0x09, 0x0C, 0x18, 0x19, 0x1A, 0x1C, 0x1D, 0x1E]` (REQ-2.2).
  - Unit: the four no-effect bytes are `[0x00, 0x0E, 0x0F, 0x10]` (REQ-2.3).
  - Unit: `ROW_DEFAULTS` equals `[0x07, 0x09, 0x0A, 0x0C, 0x19, 0x1C, 0x1F]` (REQ-2.4).
  - Unit: every name in `CONTROL_CODES` matches the ETS table exactly (spot-check five entries).

---

## Phase 4 — Mosaic helpers (`mosaic.ts`) — REQ-4

- [ ] **T-4.1** Implement `encodeBlockMask` and `decodeBlockMask` in `skeleton/src/mosaic.ts` using the formulas from design §6.
- [ ] **T-4.2** Write `skeleton/test/mosaic.test.ts`:
  - Unit: `encodeBlockMask(0)` === 0x20 and `encodeBlockMask(63)` === 0x7F (REQ-4.3).
  - Unit: every encoded byte has bit 5 set (REQ-4.4).
  - **[PBT REQ-4.1]** `fc.integer({min:0,max:63})`: `decodeBlockMask(encodeBlockMask(mask))` === mask.
  - **[PBT REQ-4.2]** `fc.integer({min:0,max:63}).map(encodeBlockMask)`: `encodeBlockMask(decodeBlockMask(byte))` === byte.

---

## Phase 5 — Display interpreter (`interpreter.ts`) — REQ-3

- [ ] **T-5.1** Implement the `AttrState` reset logic and the row-scan loop in `skeleton/src/interpreter.ts`. Handle set-at and set-after timing, no-effect codes, and the `DisplayCell` type.
- [ ] **T-5.2** Write unit tests for basic interpreter cases in `skeleton/test/interpreter.test.ts`:
  - A page of all 0x20 produces 24×40 cells all with fg=7, bg=0, char=' ', flash=false, conceal=false.
  - Placing a set-after colour code (e.g. 0x01 Red) at column 5: cells 0–5 have fg=7, cells 6–39 have fg=1 (REQ-3.3).
  - Placing a set-at code (e.g. 0x09 Steady) at column 5: cell 5 has steady=true (REQ-3.2).
  - **[PBT REQ-3.1.1]** Arbitrary page: for every row, the first cell always has fg=7, bg=0, flash=false.
  - **[PBT REQ-3.3.1]** Arbitrary column position for a set-after colour code: the cell at that column never has the new foreground colour.
- [ ] **T-5.3** Implement hold mosaics logic (REQ-3.5). Add tests:
  - Unit: control cell under Hold Mosaics shows the held mosaic glyph, not a space.
  - Unit: held mosaic resets to blank at the start of a new row.
- [ ] **T-5.4** Implement conceal and reveal (REQ-3.6). Add tests:
  - Unit: concealed cell renders as space when reveal=false.
  - Unit: same cell renders actual char when reveal=true.
- [ ] **T-5.5** Implement flash and steady (REQ-3.7). Add tests:
  - Unit: cell between Flash and Steady has flash=true.
  - Unit: cell at or after Steady has flash=false.
- [ ] **T-5.6** Implement New Background (REQ-3.8). Add tests:
  - Unit: cell at 0x1D position has bg equal to the fg colour active at that cell.
- [ ] **T-5.7** Implement double height (REQ-3.9). Add tests:
  - Unit: row r+1 cells are all spaces when row r has a Double Height code.
  - Unit: Double Height on row 23 has no effect on row 23 or below.
  - **[PBT REQ-3.9.1]** Arbitrary page with a double-height code in row r < 23: every cell in row r+1 has char=' ' and mosaicMask=0.
- [ ] **T-5.8** Implement no-effect code handling (REQ-3.10). Add tests:
  - Unit: bytes 0x00, 0x0E, 0x0F, 0x10 each produce the same display cell as 0x20 at the same column.

---

## Phase 6 — Page store and router (`store.ts`) — REQ-5

- [ ] **T-6.1** Implement `createStore`, `nextPage`, `prevPage`, `goToPage` in `skeleton/src/store.ts`. Page numbers outside 100–899 are rejected.
- [ ] **T-6.2** Write `skeleton/test/store.test.ts` for navigation:
  - Unit: `goToPage` with n < 100 or n > 899 throws.
  - **[PBT REQ-5.1.2]** `fc.integer({min:100,max:899})`: `nextPage` and `prevPage` always return a value in 100–899.
  - **[PBT REQ-5.1.3]** Same arbitrary n: `prevPage(nextPage(n))` === n and `nextPage(prevPage(n))` === n.
- [ ] **T-6.3** Implement `enterDigit` digit-entry state machine in `skeleton/src/store.ts`.
- [ ] **T-6.4** Write tests for digit entry:
  - Unit: one or two digits return navigate=null.
  - Unit: first digit 0 or 9 resets state and returns navigate=null (REQ-5.2.3).
  - **[PBT REQ-5.2.2]** `fc.integer({min:1,max:8})` × `fc.integer({min:0,max:9})` × `fc.integer({min:0,max:9})`: three-digit sequence produces a page in 100–899.
- [ ] **T-6.5** Implement `tickCarousel` in `skeleton/src/store.ts`.
- [ ] **T-6.6** Write tests for carousel:
  - Unit: carousel wraps from last subpage back to 0.
  - **[PBT REQ-5.3.1]** `fc.integer({min:1,max:20})` subpages, `fc.integer({min:1,max:100})` ticks: subpage index is always in 0 to k−1.

---

## Phase 7 — Fastext (`fastext.ts`) — REQ-6

- [ ] **T-7.1** Implement `fillPromptRow` and `handleFastextKey` in `skeleton/src/fastext.ts`.
- [ ] **T-7.2** Write `skeleton/test/fastext.test.ts`:
  - Unit: `handleFastextKey` with an absent link returns null (REQ-6.3).
  - Unit: the prompt row contains the four colour control bytes 0x01, 0x02, 0x03, 0x06 (REQ-6.2).
  - **[PBT REQ-6.1]** Arbitrary `FastextConfig`: `fillPromptRow` always returns exactly 40 bytes.

---

## Phase 8 — Codec (`codec.ts`) — REQ-7

- [ ] **T-8.1** Implement `encode` and `decode` in `skeleton/src/codec.ts` using RLE then base64url.
- [ ] **T-8.2** Write `skeleton/test/codec.test.ts`:
  - Unit: `decode(encode(allSpacePage))` equals the original and the encoded length is less than 960 chars (REQ-7.4).
  - Unit: `decode` throws `CodecError` on an invalid string (REQ-7.3).
  - **[PBT REQ-7.1]** Arbitrary 960-byte page: `decode(encode(page))` is byte-for-byte identical to the original.
  - **[PBT REQ-7.2]** Arbitrary 960-byte page: `encode(page)` matches `/^[A-Za-z0-9\-_.]+$/`.

---

## Phase 9 — SVG renderer (`renderer.ts`) — REQ-8

- [ ] **T-9.1** Implement `renderSVG` in `skeleton/src/renderer.ts` using string concatenation. Escape all text content characters `<`, `>`, `&`, `"`.
- [ ] **T-9.2** Write `skeleton/test/renderer.test.ts`:
  - Unit: output starts with `<svg` and ends with `</svg>`.
  - Unit: calling renderer twice with identical input produces identical output (REQ-8.2).
  - Unit: a flashing cell produces a `<g class="flash">` wrapper (REQ-8.3).
  - Unit: mosaic cells emit `<rect>` elements, not `<text>` (REQ-8.5).
  - Unit: background rect is emitted even for a space cell (REQ-8.6).
  - **[PBT REQ-8.1]** Arbitrary page containing `<`, `>`, `&` characters in text cells: the SVG output does not contain a bare `<` or `>` from page text (all are `&lt;` / `&gt;`).

---

## Phase 10 — Browser viewer (`viewer.ts`) — REQ-9

- [ ] **T-10.1** Implement `mapKey` as a pure function in `skeleton/src/viewer.ts` (REQ-9.3).
- [ ] **T-10.2** Write `skeleton/test/viewer.test.ts` for `mapKey`:
  - Unit: digit keys '0'–'9' map to `{ type: 'digit', value: 0..9 }`.
  - Unit: colour key mappings produce the correct Fastext action.
  - Unit: an unmapped key returns null.
- [ ] **T-10.3** Implement `startCarousel` returning a stop function (REQ-9.2). Test with Vitest fake timers:
  - Unit: `onTick` is called the correct number of times after n intervals.
  - Unit: calling the stop function prevents further calls.
- [ ] **T-10.4** Implement the top-level viewer wiring (keyboard listener, carousel setup, reveal toggle, header clock update, DOM update). No unit tests for DOM wiring; manual browser test is sufficient. Document the expected HTML structure in a comment at the top of `viewer.ts`.

---

## Phase 11 — Public API barrel (`index.ts`)

- [ ] **T-11.1** Create `skeleton/src/index.ts` that re-exports all public names from every module. Verify by importing each exported name in a smoke test.

---

## Phase 12 — Integration

- [ ] **T-12.1** Run the full test suite (`vitest run`) and confirm all tests pass with zero failures.
- [ ] **T-12.2** Run `tsc --noEmit` and confirm zero TypeScript errors.
- [ ] **T-12.3** Confirm `skeleton/package.json` lists zero entries under `dependencies` (only `devDependencies`).
