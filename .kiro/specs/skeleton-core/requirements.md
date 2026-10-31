# skeleton-core requirements

Source of truth for all control code facts: `docs/ets300706-level1-reference.md`.

Requirements use EARS notation: WHEN <trigger> THE SYSTEM SHALL <response>.
Every requirement has an ID of the form REQ-N. Acceptance criteria have IDs of the form REQ-N.M.
Criteria tagged [PBT] must be covered by a property-based test using fast-check.

---

## REQ-1 Cell model

**WHEN** a page is created THE SYSTEM SHALL represent it as a two-dimensional grid of 7-bit bytes with exactly 24 rows and exactly 40 columns, where row index 0 is the page header and row index 23 is the Fastext prompt row.

### Acceptance criteria

- **REQ-1.1** [PBT] For every valid page value produced by the system, the grid always has exactly 24 rows and each row always has exactly 40 columns.
- **REQ-1.2** Row index 0 is accessible as the header row and row index 23 is accessible as the Fastext prompt row by those names as well as by numeric index.
- **REQ-1.3** Every byte stored in a cell is a value in the range 0x00 to 0x7F; values outside that range are rejected at write time.

---

## REQ-2 Control code table

**WHEN** the skeleton is initialised THE SYSTEM SHALL expose a table of all 32 Level 1 spacing attributes, where each entry records the byte value (0x00 to 0x1F), the canonical name from ETS 300 706, and the timing (set-at or set-after).

### Acceptance criteria

- **REQ-2.1** The table contains exactly 32 entries, one for each byte in the range 0x00 to 0x1F.
- **REQ-2.2** The eight set-at bytes are exactly 0x09, 0x0C, 0x18, 0x19, 0x1A, 0x1C, 0x1D, and 0x1E; all other control bytes are set-after.
- **REQ-2.3** The four bytes with no effect at Level 1 are 0x00 (Alpha Black), 0x10 (Mosaics Black), 0x0E (Double Width), and 0x0F (Double Size).
- **REQ-2.4** The seven row-start defaults are Alpha White (0x07), Steady (0x09), End Box (0x0A), Normal Size (0x0C), Contiguous Mosaic Graphics (0x19), Black Background (0x1C), and Release Mosaics (0x1F).

---

## REQ-3 Display interpreter

**WHEN** the display interpreter is given a 24×40 page of raw bytes THE SYSTEM SHALL produce a 24×40 grid of display cells by scanning each row left-to-right and applying all of the following rules derived from ETS 300 706.

### REQ-3.1 Row-start defaults

At the start of every row the interpreter SHALL reset its attribute state to: foreground Alpha White, Steady, End Box, Normal Size, Contiguous Mosaic Graphics, Black Background, Release Mosaics.

**Acceptance criteria**

- **REQ-3.1.1** [PBT] For every page, the attribute state at the first cell of every row is the defined default state; no attribute set by one row carries into the next row.

### REQ-3.2 Set-at timing

WHEN a set-at control byte is encountered THE SYSTEM SHALL apply its attribute to the display cell at the same column as the control byte and to all following cells in the same row.

**Acceptance criteria**

- **REQ-3.2.1** A set-at control cell shall be rendered using the new attribute it introduces, not the previous attribute.

### REQ-3.3 Set-after timing

WHEN a set-after control byte is encountered THE SYSTEM SHALL apply its attribute starting at the cell immediately to the right of the control byte; the control cell itself is rendered under the previous attribute.

**Acceptance criteria**

- **REQ-3.3.1** [PBT] For every set-after colour-change control byte placed at any column, the display cell at that column never shows the new colour; the new colour first appears at the next column.

### REQ-3.4 Mosaic mode

WHEN a mosaic colour control byte (0x11 to 0x17) is encountered THE SYSTEM SHALL switch the character set to G1 mosaic mode from the next cell (set-after). In mosaic mode, bytes whose bit 6 is 1 (0x20–0x3F and 0x60–0x7F) are interpreted as mosaic block characters. The interpreter shall respect contiguous and separated mosaic state.

**Acceptance criteria**

- **REQ-3.4.1** A byte in mosaic mode with bit 6 equal to 1 produces a mosaic display cell. A byte in mosaic mode with bit 6 equal to 0 (0x40–0x5F) produces an alpha-mode capital letter.

### REQ-3.5 Hold mosaics

WHEN Hold Mosaics (0x1E, set-at) is active THE SYSTEM SHALL display control cells as the held mosaic character (the most recent mosaic byte with bit 6 = 1 on that row) rather than a space. The held character shall always be shown in its original contiguous or separated form.

WHEN any of the following occurs THE SYSTEM SHALL reset the held mosaic to a blank: the start of a row, a transition between text and mosaic mode, or a size change.

**Acceptance criteria**

- **REQ-3.5.1** A control cell under Hold Mosaics shows the most recently seen mosaic character, not a space.
- **REQ-3.5.2** The held mosaic resets to blank at the start of each row, independent of any prior row's state.

### REQ-3.6 Conceal

WHEN the Conceal attribute (0x18, set-at) is active and the viewer has not requested reveal THE SYSTEM SHALL display affected cells as spaces in the foreground colour, preserving the cell structure.

WHEN reveal is active THE SYSTEM SHALL display concealed cells with their actual character content.

**Acceptance criteria**

- **REQ-3.6.1** Concealed cells render as spaces when reveal is off.
- **REQ-3.6.2** The same cells render their actual content when reveal is on.

### REQ-3.7 Flash

WHEN the Flash attribute (0x08, set-after) is active THE SYSTEM SHALL mark affected display cells as flashing. The renderer uses this flag; the interpreter only records it. Steady (0x09, set-at) cancels Flash on that cell and all following cells in the row.

**Acceptance criteria**

- **REQ-3.7.1** A display cell between a Flash and a Steady code has its flash flag set to true.
- **REQ-3.7.2** A display cell at or after a Steady code has its flash flag set to false, regardless of any prior Flash code.

### REQ-3.8 New Background

WHEN New Background (0x1D, set-at) is encountered THE SYSTEM SHALL immediately make the current foreground colour the background colour for that cell and all subsequent cells in the row, until the background is changed again or the row ends.

**Acceptance criteria**

- **REQ-3.8.1** The display cell at the New Background position shows the background colour equal to the foreground colour that was active at that cell.

### REQ-3.9 Double height

WHEN a Double Height control byte (0x0D, set-after) is encountered on a row whose index is not 23 THE SYSTEM SHALL mark cells from the next column to the end of that row as double-height top. The row immediately below shall be rendered showing only its background colour (all cells blank, using the background colour of each cell in the row below) with no foreground glyphs.

WHEN Double Height appears on row 23 THE SYSTEM SHALL treat it as a no-effect code.

**Acceptance criteria**

- **REQ-3.9.1** [PBT] For every page where any row r < 23 contains a Double Height code, every display cell in row r+1 has no foreground glyph (its character is a space and its mosaic mask is zero).
- **REQ-3.9.2** Double Height on row 23 has no effect on row 23 or any other row.

### REQ-3.10 No-effect codes

WHEN the interpreter encounters any of 0x00 (Alpha Black), 0x10 (Mosaics Black), 0x0E (Double Width), or 0x0F (Double Size) THE SYSTEM SHALL produce a space at that cell with no attribute change, as though those bytes were 0x20.

**Acceptance criteria**

- **REQ-3.10.1** Placing 0x00, 0x10, 0x0E, or 0x0F in any cell results in the same display output as placing 0x20 in that cell.

---

## REQ-4 Mosaic helpers

**WHEN** called with a block mask integer (bits TL=1, TR=2, ML=4, MR=8, LL=16, LR=32) THE SYSTEM SHALL encode it to the correct G1 mosaic byte using the formula `0x20 | (mask & 0x1F) | (mask & 0x20 ? 0x40 : 0)`.

**WHEN** called with a G1 mosaic byte THE SYSTEM SHALL decode it back to the block mask integer using the inverse of the same formula.

### Acceptance criteria

- **REQ-4.1** [PBT] For every integer block mask in the range 0 to 63 (all 6 bit combinations), `decodeBlockMask(encodeBlockMask(mask))` returns the original mask.
- **REQ-4.2** [PBT] For every valid mosaic byte in the G1 set, `encodeBlockMask(decodeBlockMask(byte))` returns the original byte.
- **REQ-4.3** The encoded byte for a mask of 0 (all blocks off) is 0x20 and for a mask of 63 (all blocks on) is 0x7F.
- **REQ-4.4** The encoded byte always has bit 5 set (value & 0x20 === 0x20) and bits 0 and 6 follow the formula exactly.

---

## REQ-5 Page store and router

**WHEN** the page store is initialised THE SYSTEM SHALL accept pages with numbers in the inclusive range 100 to 899. Each page number may have one or more subpages, numbered from 0 upwards.

**WHEN** the router navigates to the next or previous page THE SYSTEM SHALL wrap around within the range 100 to 899.

### REQ-5.1 Page number validation

**Acceptance criteria**

- **REQ-5.1.1** Attempting to store or retrieve a page with a number outside 100 to 899 SHALL result in an error.
- **REQ-5.1.2** [PBT] For every page number n in 100 to 899, `nextPage(n)` is in 100 to 899 and `prevPage(n)` is in 100 to 899.
- **REQ-5.1.3** [PBT] For every page number n in 100 to 899, `prevPage(nextPage(n))` equals n and `nextPage(prevPage(n))` equals n (next and previous are exact inverses).

### REQ-5.2 Digit-entry state machine

**WHEN** the user presses digit keys one at a time THE SYSTEM SHALL accumulate up to three digits and navigate to the resulting page number only when the third digit is entered.

**Acceptance criteria**

- **REQ-5.2.1** Entering one or two digits does not navigate immediately; the display shows a partial number.
- **REQ-5.2.2** [PBT] For every three-digit sequence formed from digits 1–8 in the first position and 0–9 in the second and third positions, the resulting page number is in 100 to 899.
- **REQ-5.2.3** A digit sequence starting with 0 or 9 (which would produce a page outside 100–899) is either rejected on the first digit or the input is reset.

### REQ-5.3 Subpage carousel

**WHEN** the carousel timer fires THE SYSTEM SHALL advance the subpage index for the current page by one, wrapping to 0 after the last subpage.

**Acceptance criteria**

- **REQ-5.3.1** [PBT] For a page with k subpages (k ≥ 1), the carousel subpage index after any number of timer ticks is always in the range 0 to k−1.
- **REQ-5.3.2** After the last subpage, the next tick wraps the index back to 0.

---

## REQ-6 Fastext

**WHEN** a page is configured with Fastext links THE SYSTEM SHALL store up to four coloured links (red, green, yellow, cyan) and one index link, where each link is a page number in 100 to 899 or absent.

**WHEN** the prompt row is filled THE SYSTEM SHALL write exactly 40 bytes into row 23, with the four coloured labels each preceded by the matching colour control code.

**WHEN** a Fastext key is pressed THE SYSTEM SHALL navigate to the page stored for that colour, if present.

### Acceptance criteria

- **REQ-6.1** [PBT] For every valid Fastext configuration, `fillPromptRow(config)` returns exactly 40 bytes.
- **REQ-6.2** The prompt row always contains exactly four colour control bytes (one each for red 0x01, green 0x02, yellow 0x03, cyan 0x06).
- **REQ-6.3** Pressing a colour key when that link is absent is a no-op; the current page does not change.
- **REQ-6.4** Pressing the index key navigates to the index page if present, otherwise is a no-op.

---

## REQ-7 Codec

**WHEN** a page is encoded THE SYSTEM SHALL produce a compact, URL-safe string that contains no characters outside the set `A–Z a–z 0–9 - _ .` (RFC 4648 base64url alphabet extended with `.`).

**WHEN** the codec decodes a previously encoded string THE SYSTEM SHALL reproduce a page byte-for-byte identical to the original.

### Acceptance criteria

- **REQ-7.1** [PBT] For every page grid, `decode(encode(page))` is byte-for-byte identical to the original page.
- **REQ-7.2** [PBT] For every page grid, `encode(page)` contains only characters matching `[A-Za-z0-9\-_.]`.
- **REQ-7.3** Decoding a string that is not a valid encoding SHALL return an error, not a partial result.
- **REQ-7.4** The encoded form of an all-space page (960 bytes of 0x20) shall be shorter than 960 characters (compression is applied).

---

## REQ-8 SVG renderer

**WHEN** the SVG renderer is given a 24×40 grid of display cells THE SYSTEM SHALL return a deterministic UTF-8 string containing a valid SVG document.

### Acceptance criteria

- **REQ-8.1** [PBT] For every page, the SVG output contains no unescaped `<` or `>` originating from page text content (all text is escaped before insertion into the SVG).
- **REQ-8.2** The output is a deterministic function of the display-cell grid: calling the renderer twice with identical input produces identical output.
- **REQ-8.3** Display cells with the flash flag set are wrapped in an SVG element that enables CSS animation by a class name, so the browser can toggle visibility.
- **REQ-8.4** Each cell position corresponds to a fixed-size rectangle; the total SVG viewBox dimensions are derived from the row and column counts (24 and 40).
- **REQ-8.5** Mosaic cells are rendered as filled rectangles for each active block, not as Unicode block characters.
- **REQ-8.6** The background colour of each cell is rendered even when the cell contains a space, so coloured backgrounds are fully visible.

---

## REQ-9 Browser viewer

**WHEN** the browser viewer is loaded THE SYSTEM SHALL wire the following to the pure skeleton functions with no server-side state:

- Digit keys 0–9 feed the three-digit entry state machine.
- Colour keys (mapped to keyboard shortcuts) trigger Fastext navigation.
- A reveal toggle switches the interpreter's reveal flag and re-renders.
- A carousel timer fires at a configurable interval and advances the subpage.
- A header clock updates the time display in row 0 once per second.

### Acceptance criteria

- **REQ-9.1** The viewer contains no business logic; it only calls skeleton functions and updates the DOM.
- **REQ-9.2** The carousel timer is started and stopped through a single exported function pair so tests can control it.
- **REQ-9.3** The keyboard handler is a pure function that maps a `KeyboardEvent.key` string to a skeleton action type; it has no side effects.

---

## REQ-10 Page composition

**WHEN** an app uses the page builder THE SYSTEM SHALL provide a `PageBuilder` class in `skeleton/src/builder.ts` that lets apps lay out pages without writing raw bytes. The builder exposes the following operations:

- `header(pageNumber: number, serviceName: string, clockText: string)` — writes row 0 with the page number left-aligned, the service name centred, and the clock text right-aligned in columns 32–39.
- `title(text: string)` — writes rows 1 and 2 as a double-height cyan title: places 0x0D (Double Height) at column 0 and 0x06 (Alpha Cyan) at column 1 of row 1, then writes the text starting at column 2; row 2 is left as the double-height lower row.
- `text(row: number, col: number, str: string, options?: { fg?: Colour; bg?: Colour })` — writes the string starting at (row, col), applying an optional foreground and background colour control code before the text; if the text plus its control codes would reach or exceed column 39 the text is silently truncated at column 39 and the last visible character is replaced with `>` to indicate overflow; text that fits within bounds is written as-is; row 23 is rejected and the call is silently ignored.
- `heading(row: number, str: string)` — writes 0x03 (Alpha Yellow) at col 0, then `str` from col 1; silently truncates to column 39.
- `value(row: number, col: number, str: string)` — writes 0x07 (Alpha White) then `str`; silently truncates to column 39.
- `mosaicBar(row: number, col: number, width: number, fraction: number, colour: Colour)` — writes the mosaic colour control byte (`colour + 0x10`) then `Math.round(fraction * width)` cells of `encodeBlockMask(0x3F)` followed by enough `encodeBlockMask(0)` cells to fill the remaining width; clamps `fraction` to [0, 1].
- `list(row: number, label: string, valueStr: string)` — writes the label left-aligned in green (0x02) and the value right-aligned in white (0x07) on the same row, fitting within 40 columns.
- `wrapText(str: string, width: number): string[]` — a pure helper method that splits `str` into lines no longer than `width` characters, breaking on spaces; words longer than `width` are hard-split.
- `build(): RawPage` — returns the completed page as a 960-byte `Uint8Array`.

The builder must place each colour or size control code in its own cell (control codes occupy a cell per ETS 300 706). It must never write outside row bounds (0–23) or column bounds (0–39). It must never put data text on row 23.

### Acceptance criteria

- **REQ-10.1** [PBT] For any sequence of builder operations, `build()` returns a `RawPage` of exactly 960 bytes where every byte is in the range 0 to 127.
- **REQ-10.2** [PBT] No sequence of builder operations writes any non-space byte into row 23 (the Fastext prompt row is protected).
- **REQ-10.3** [PBT] `mosaicBar` with any `fraction` in [0, 1] produces a number of filled mosaic blocks that is monotonically non-decreasing as `fraction` increases.
- **REQ-10.4** [PBT] `wrapText(str, width)` returns lines where no line exceeds `width` characters, and joining the lines with spaces reconstructs the original words in their original order.

---

## REQ-11 Page providers and the viewer

**WHEN** an app mounts the teletext viewer THE SYSTEM SHALL define the following abstractions in `skeleton/src/viewer.ts`:

- `ProvidedPage` — a record with `subpages: RawPage[]` (at least one entry) and `fastext: FastextConfig`.
- `PageProvider` — the function type `(pageNumber: number, subpage: number) => Promise<ProvidedPage | null>`. A return value of `null` means the page does not exist.
- `mountTeletext(element: HTMLElement, provider: PageProvider, options?: { carouselMs?: number }): () => void` — mounts the viewer into `element`, starts the digit-entry state machine, the carousel timer, and the header clock. Returns an unmount function. The viewer behaves as follows:
  - While a provider call is pending it shows the built-in loading page (REQ-12) and displays the partial digit string in the header.
  - If the provider resolves to `null` it shows the built-in not-found page (REQ-12).
  - If the provider rejects it shows the built-in error page (REQ-12).
  - Otherwise it interprets and renders the page through the existing `interpretPage` and `renderSVG` pipeline.
- While a three-digit page number is being entered the viewer shows the typed digits in columns 0–2 of row 0 of the currently displayed page.

The viewer state machine has exactly four states: `loading`, `page`, `not-found`, and `error`. It is never in more than one state at a time.

### Acceptance criteria

- **REQ-11.1** [PBT] For any provider result (resolved `ProvidedPage`, resolved `null`, or rejected `Promise`), the viewer state machine ends in exactly one of the four states: `loading`, `page`, `not-found`, or `error`.
- **REQ-11.2** [PBT] Digit entry combined with any provider never causes the viewer to request a page number outside the range 100 to 899.

---

## REQ-12 Built-in system pages

**WHEN** any part of the system needs to display a standard status screen THE SYSTEM SHALL provide the following pure builder functions in `skeleton/src/system-pages.ts`, so that every app shows the same system screens without duplicating page-building code:

- `makeLoadingPage(pageNumber: number): RawPage` — produces a loading page for the given page number. Row 0 shows the page number and `Loading...`. Row 5 shows `Loading...` in white. Row 23 is left as a blank prompt row.
- `makeNotFoundPage(pageNumber: number): RawPage` — produces a not-found page. Row 2 shows `PAGE NNN NOT FOUND` in red (0x01), where NNN is the three-digit page number. Row 4 shows `Enter a page number (100-899)`. Row 23 is the Fastext prompt row.
- `makeErrorPage(title: string, message: string, fastext: FastextConfig): RawPage` — produces an error page. Row 1–2 shows `title` as a double-height red title. Row 4 onwards shows `message` wrapped with `wrapText` from `builder.ts`, one line per row, up to row 21. Row 23 uses `fillPromptRow` with the provided `fastext` configuration.

All three functions use `wrapText` for any text that might exceed 38 columns.

### Acceptance criteria

- **REQ-12.1** [PBT] `makeLoadingPage`, `makeNotFoundPage`, and `makeErrorPage` always return a `RawPage` of exactly 960 bytes.
- **REQ-12.2** [PBT] The byte at every cell of row 23 produced by `makeLoadingPage` and `makeNotFoundPage` is 0x20 (the row is blank, reserved for the Fastext prompt, not written by these two functions).
- **REQ-12.3** For `makeErrorPage`, row 23 is filled by `fillPromptRow` using the provided `fastext` argument; no data text appears on row 23.
