# skeleton-core design

This document describes the module structure, data types, and algorithms for the `skeleton/` package. It is derived from the requirements in `requirements.md` and constrained by the facts in `docs/ets300706-level1-reference.md`. No code is written here; this is the blueprint for the implementation tasks in `tasks.md`.

---

## 1. Package layout

```
skeleton/
  src/
    types.ts         — shared type aliases (no logic)
    grid.ts          — cell model (REQ-1)
    codes.ts         — control code table (REQ-2)
    interpreter.ts   — display interpreter (REQ-3)
    mosaic.ts        — mosaic helpers (REQ-4)
    store.ts         — page store and router (REQ-5)
    fastext.ts       — Fastext links and prompt row (REQ-6)
    codec.ts         — encode / decode (REQ-7)
    renderer.ts      — SVG renderer (REQ-8)
    viewer.ts        — browser viewer wiring (REQ-9, REQ-11)
    builder.ts       — PageBuilder for app page composition (REQ-10)
    system-pages.ts  — built-in loading, not-found and error pages (REQ-12)
    index.ts         — single public re-export barrel
  test/
    grid.test.ts
    codes.test.ts
    interpreter.test.ts
    mosaic.test.ts
    store.test.ts
    fastext.test.ts
    codec.test.ts
    renderer.test.ts
    viewer.test.ts
    builder.test.ts
    system-pages.test.ts
  package.json
  tsconfig.json
```

The package has zero runtime dependencies. Vitest and fast-check are devDependencies only.

---

## 2. Shared types (`types.ts`)

```
RawPage     = Uint8Array  // 960 bytes, row-major: index = row*40 + col
RawRow      = Uint8Array  // 40 bytes, a slice of RawPage
Colour      = 0|1|2|3|4|5|6|7  // index into a fixed 8-colour palette
Size        = 'normal' | 'double-height-top' | 'double-height-lower'
CharMode    = 'alpha' | 'mosaic'
```

`RawPage` is a flat `Uint8Array` of 960 bytes, row-major. Row r, column c is at index `r * 40 + c`. Using a flat array keeps the data structure simple and enables efficient slice operations.

---

## 3. Cell model (`grid.ts`) — REQ-1

### 3.1 RawPage factory

`createPage(): RawPage` — allocates a 960-byte `Uint8Array` filled with 0x20 (space).

`getCell(page: RawPage, row: number, col: number): number` — bounds-checked read. Throws a `RangeError` if row is outside 0–23 or col is outside 0–39.

`setCell(page: RawPage, row: number, col: number, byte: number): void` — bounds-checked write. Also throws `RangeError` if byte is outside 0–127 (REQ-1.3).

`getRow(page: RawPage, row: number): RawRow` — returns a zero-copy `Uint8Array` view of 40 bytes.

Named accessors for `HEADER_ROW = 0` and `PROMPT_ROW = 23` are exported as constants.

---

## 4. Control code table (`codes.ts`) — REQ-2

### 4.1 Data layout

A `ControlCode` record:

```
{
  byte:   number   // 0x00 to 0x1F
  name:   string   // canonical ETS 300 706 name
  timing: 'set-at' | 'set-after'
  noEffect: boolean  // true for 0x00, 0x0E, 0x0F, 0x10
}
```

`CONTROL_CODES: readonly ControlCode[]` — all 32 entries in byte order.

`ROW_DEFAULTS: readonly number[]` — the seven default bytes applied at the start of each row: `[0x07, 0x09, 0x0A, 0x0C, 0x19, 0x1C, 0x1F]`.

`isSetAt(byte: number): boolean` — returns true for the eight set-at bytes.

`isControlByte(byte: number): boolean` — returns true for bytes 0x00 to 0x1F.

---

## 5. Display interpreter (`interpreter.ts`) — REQ-3

### 5.1 Display cell type

`DisplayCell` is a plain object:

```
{
  char:       string    // single UTF-16 character or empty string for control cells
  fg:         Colour
  bg:         Colour
  flash:      boolean
  conceal:    boolean
  size:       Size
  charMode:   CharMode
  mosaicMask: number    // 0–63; only meaningful when charMode === 'mosaic'
  separated:  boolean   // contiguous (false) vs separated (true)
}
```

### 5.2 Interpreter state

The interpreter maintains a mutable `AttrState` record that is reset at the start of every row:

```
{
  fg:          Colour    // starts at 7 (white)
  bg:          Colour    // starts at 0 (black)
  flash:       boolean   // starts false
  conceal:     boolean   // starts false
  size:        'normal' | 'double-height-top'
  charMode:    CharMode  // starts 'alpha'
  separated:   boolean   // starts false (contiguous)
  holdMosaics: boolean   // starts false
  heldMosaic:  number | null  // null = space; the byte value of the last G1 character
}
```

### 5.3 Row scan algorithm

`interpretPage(page: RawPage, reveal: boolean): DisplayCell[][]`

Returns a 24×40 matrix. For each row r = 0 to 23:

1. Reset `AttrState` to row defaults (REQ-3.1).
2. Mark row as `doubleHeightLower` if row r was flagged in a pass over row r-1 (REQ-3.9).
3. For each column c = 0 to 39:
   a. Read byte b from page at (r, c).
   b. If b is in 0x20–0x7F and not a control byte: emit a display cell using current state.
   c. If b is a control byte:
      - If set-at: update state immediately, then emit a cell using the new state.
      - If set-after: emit a cell using the current (pre-change) state, then update state.
      - If the byte is a no-effect code (0x00, 0x0E, 0x0F, 0x10): emit a space, no state change.
      - Under Hold Mosaics: the emitted cell for a control byte shows the held mosaic, in its original form and colour.
   d. After emitting: if this byte is a G1 mosaic byte (charMode === 'mosaic' and bit 6 = 1), update `heldMosaic`.
   e. If charMode or size changes, reset `heldMosaic` to null (REQ-3.5).
4. If row r < 23 and a double-height code was encountered, flag row r+1 as doubleHeightLower.

**Double-height lower rows (REQ-3.9):** when a row is flagged as doubleHeightLower, its cells are emitted with: char = ' ', mosaicMask = 0, flash = false, conceal = false, but with the background colour from that row's own attribute scan (which still runs so background changes in the lower row do affect the background colour).

### 5.4 Conceal handling

When `state.conceal` is true and `reveal` is false, the emitted cell's `char` is forced to `' '` and `mosaicMask` to 0. The underlying byte is not stored in the display cell; the interpreter is a pure read-only transform.

---

## 6. Mosaic helpers (`mosaic.ts`) — REQ-4

### 6.1 Bit layout (from ETS 300 706)

Bit positions in the mask integer:

| Bit value | Block |
|-----------|-------|
| 1         | Top-left |
| 2         | Top-right |
| 4         | Middle-left |
| 8         | Middle-right |
| 16        | Lower-left |
| 32        | Lower-right |

### 6.2 Functions

`encodeBlockMask(mask: number): number`
Formula: `0x20 | (mask & 0x1F) | (mask & 0x20 ? 0x40 : 0)`
Input range: 0 to 63. Returns a byte in the range 0x20–0x3F or 0x60–0x7F.

`decodeBlockMask(byte: number): number`
Inverse: `(byte & 0x1F) | (byte & 0x40 ? 0x20 : 0)`
Input: a valid G1 mosaic byte (bit 6 = 1). Returns 0 to 63.

Both functions are pure with no side effects. They do not check that Hold Mosaics is active; that is the interpreter's responsibility.

---

## 7. Page store and router (`store.ts`) — REQ-5

### 7.1 Data structures

`PageNumber` is a branded type alias for `number`, restricted to 100–899.

`SubpageIndex` is a non-negative integer less than the number of subpages.

`Page` record:

```
{
  number:    PageNumber
  subpages:  RawPage[]     // at least one entry
  fastext:   FastextConfig
}
```

`PageStore` record:

```
{
  pages:       Map<PageNumber, Page>
  currentPage: PageNumber
  currentSub:  SubpageIndex
}
```

### 7.2 Navigation functions (all pure, take and return state)

`nextPage(store: PageStore): PageStore` — advances `currentPage` to the next stored page number above the current one; wraps from 899 (or the highest stored) back to 100 (or the lowest stored). If only one page is stored, it is a no-op.

`prevPage(store: PageStore): PageStore` — symmetric.

`goToPage(store: PageStore, n: PageNumber): PageStore` — sets `currentPage` to n and `currentSub` to 0. Throws if n is not in the store.

### 7.3 Digit entry state machine

`DigitState` record:

```
{ digits: string  // '' | one digit | two digits }
```

`enterDigit(state: DigitState, digit: number): { next: DigitState, navigate: PageNumber | null }`

- digit 0–9 is appended to `state.digits`.
- If the first digit would produce a magazine outside 1–8 (i.e., digit is 0 or 9), the state resets and `navigate` is null.
- After three digits, `navigate` is the page number and state resets to `{ digits: '' }`.
- After one or two digits, `navigate` is null.

### 7.4 Carousel

`tickCarousel(store: PageStore): PageStore` — advances `currentSub` by 1, wrapping to 0 after the last subpage index of the current page.

---

## 8. Fastext (`fastext.ts`) — REQ-6

### 8.1 Data structure

`FastextConfig` record:

```
{
  red:    PageNumber | null
  green:  PageNumber | null
  yellow: PageNumber | null
  cyan:   PageNumber | null
  index:  PageNumber | null
}
```

### 8.2 Functions

`fillPromptRow(config: FastextConfig, labels: FastextLabels): RawRow`

`FastextLabels` is a record of four short label strings (one per colour key), each padded or truncated to fit the allocated space within the 40-column row. The function returns a 40-byte `Uint8Array`. The row is divided into four equal zones of 10 bytes each. Each zone starts with the colour control byte (red=0x01, green=0x02, yellow=0x03, cyan=0x06), followed by the label text bytes. The row must sum to exactly 40 bytes.

`handleFastextKey(config: FastextConfig, key: 'red'|'green'|'yellow'|'cyan'|'index'): PageNumber | null`

Returns the target page number, or null if the link is absent.

---

## 9. Codec (`codec.ts`) — REQ-7

### 9.1 Encoding scheme

The 960-byte `RawPage` is compressed with a simple run-length encoding (RLE) before base64url encoding, to satisfy REQ-7.4 (all-space page shorter than 960 characters).

**RLE format (binary):**
- Since pages contain 7-bit bytes (0x00 to 0x7F), byte 0x80 is free to use as the escape marker.
- Literal byte b (any 7-bit value): emitted as-is.
- Run of k identical bytes b: emitted as a three-byte sequence `0x80 b k` where k is 1–255.
- If the byte to encode is 0x80, it would be encoded as a run (but 0x80 never appears in valid pages since they only use 7-bit bytes).

After RLE, the byte sequence is base64url-encoded (RFC 4648 §5, no padding), yielding the characters `A–Z a–z 0–9 - _`. A version prefix character (`.`) is prepended so future format changes can be detected.

`encode(page: RawPage): string`
`decode(s: string): RawPage`  — throws `CodecError` if the string is not a valid encoding.

### 9.2 URL safety

The output alphabet is `A–Za–z0–9-_.`, which is safe in a URL path segment without percent-encoding.

---

## 10. SVG renderer (`renderer.ts`) — REQ-8

### 10.1 Cell geometry

Constants:

```
CELL_W = 12   // pixels per column
CELL_H = 20   // pixels per row
COLS   = 40
ROWS   = 24
SVG_W  = CELL_W * COLS  = 480
SVG_H  = CELL_H * ROWS  = 480
```

### 10.2 Colour palette

Eight colours indexed 0–7 in teletext order:

| Index | Name    | Hex |
|-------|---------|-----|
| 0     | Black   | #000000 |
| 1     | Red     | #ff0000 |
| 2     | Green   | #00ff00 |
| 3     | Yellow  | #ffff00 |
| 4     | Blue    | #0000ff |
| 5     | Magenta | #ff00ff |
| 6     | Cyan    | #00ffff |
| 7     | White   | #ffffff |

### 10.3 Rendering algorithm

`renderSVG(cells: DisplayCell[][]): string`

1. Open `<svg xmlns="..." viewBox="0 0 480 480" width="480" height="480">`.
2. For each cell at (r, c):
   a. Emit a background `<rect>` at `x=c*CELL_W y=r*CELL_H` with fill = palette[cell.bg].
   b. If cell is a mosaic cell (charMode === 'mosaic' and mosaicMask > 0): emit up to six `<rect>` elements, one per active bit in mosaicMask, each a half- or third-height sub-rectangle in the foreground colour. Contiguous cells use the full 2×3 grid; separated cells use a slightly inset grid (1-pixel inset on each sub-block edge).
   c. Otherwise, if `cell.char` is not a space: emit `<text>` with `x`, `y` and the character. The character is escaped: `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`, `"` → `&quot;`. (REQ-8.1)
   d. If `cell.flash` is true, wrap the foreground element(s) in `<g class="flash">`.
3. Close `</svg>`.

All output is assembled by string concatenation; no DOM is used so the renderer works in both Node.js (for tests) and browsers.

---

## 11. Browser viewer (`viewer.ts`) — REQ-9, REQ-11

### 11.1 Responsibilities

The viewer is a thin layer of event wiring. It holds no business logic. Its role is to:

1. Keep a single `ViewerState` record:
   ```
   {
     store:    PageStore
     reveal:   boolean
     digitState: DigitState
   }
   ```
2. Re-render the SVG and update the DOM whenever state changes.
3. Delegate all state transitions to pure skeleton functions.

### 11.2 Provider types (REQ-11)

`ProvidedPage` is a plain object:

```
{
  subpages: RawPage[]       // at least one entry
  fastext:  FastextConfig
}
```

`PageProvider` is a function type:

```
(pageNumber: number, subpage: number) => Promise<ProvidedPage | null>
```

A resolved `null` means the page does not exist (triggers the not-found system page). A rejected promise means a fetch error (triggers the error system page).

### 11.3 Viewer state machine (REQ-11)

The viewer is always in exactly one of four states:

```
ViewerMachineState =
  | { tag: 'loading';   pageNumber: number }
  | { tag: 'page';      provided: ProvidedPage; subpage: number }
  | { tag: 'not-found'; pageNumber: number }
  | { tag: 'error';     pageNumber: number; reason: string }
```

Transitions:
- On navigation to page N: emit `loading`, call `provider(N, 0)`.
- On `provider` resolving `ProvidedPage`: emit `page`.
- On `provider` resolving `null`: emit `not-found`.
- On `provider` rejecting: emit `error` with the error message.
- On carousel tick while in `page` state: increment subpage index, call `provider(N, subpage)` only if subpage count is unknown; otherwise advance within the known `ProvidedPage.subpages` array.

### 11.4 `mountTeletext` function (REQ-11)

`mountTeletext(element: HTMLElement, provider: PageProvider, options?: { carouselMs?: number }): () => void`

1. Creates a `<div>` inside `element` to hold the SVG.
2. Starts with an initial navigation to page 100.
3. Attaches a `keydown` listener on `document` that calls `mapKey` and dispatches the resulting action.
4. Starts the carousel timer at `options.carouselMs ?? 10_000` milliseconds.
5. Starts the header clock (1-second interval, updates columns 32–39 of row 0).
6. Returns an unmount function that removes the listener, stops the carousel, stops the clock, and removes the SVG element.

While digit entry is in progress (one or two digits accumulated), the viewer writes the partial digit string into columns 0–2 of row 0 of the current raw page before passing it through `interpretPage` and `renderSVG`, so the digits are visible in the header.

### 11.5 Keyboard handler

`mapKey(key: string): Action | null`

A pure function that maps `KeyboardEvent.key` strings to discriminated union `Action` values:

```
| { type: 'digit';   value: 0|1|...|9 }
| { type: 'fastext'; colour: 'red'|'green'|'yellow'|'cyan'|'index' }
| { type: 'reveal' }
| { type: 'next' }
| { type: 'prev' }
```

Returns null for unmapped keys. Has no side effects.

### 11.6 Carousel timer

`startCarousel(onTick: () => void, intervalMs: number): () => void`
Returns a stop function. Uses `setInterval` internally. The test suite calls `startCarousel` with a mock `onTick` and controls time with Vitest's fake timers.

### 11.7 Header clock

Updates row 0, columns 32–39 (8 characters) with the current UTC time in `HH:MM:SS` format once per second using `setInterval`. The clock writes directly into the `RawPage` bytes and triggers a re-render.

---

## 12. Public API (`index.ts`)

All exported names from every source module are re-exported from `index.ts`. App code imports only from `'@skeletext/core'` (the package name), never from internal paths.

Named exports form three groups:

- **Types:** `RawPage`, `DisplayCell`, `PageStore`, `FastextConfig`, `DigitState`, `Action`, `ProvidedPage`, `PageProvider`
- **Functions:** `createPage`, `getCell`, `setCell`, `getRow`, `interpretPage`, `encodeBlockMask`, `decodeBlockMask`, `nextPage`, `prevPage`, `goToPage`, `enterDigit`, `tickCarousel`, `fillPromptRow`, `handleFastextKey`, `encode`, `decode`, `renderSVG`, `mapKey`, `startCarousel`, `mountTeletext`, `makeLoadingPage`, `makeNotFoundPage`, `makeErrorPage`
- **Classes:** `PageBuilder`
- **Constants:** `HEADER_ROW`, `PROMPT_ROW`, `CONTROL_CODES`, `ROW_DEFAULTS`, `isSetAt`, `isControlByte`

---

## 13. Key design decisions

**Flat Uint8Array for RawPage.** A single 960-byte buffer avoids object allocation per row, makes codec and interpreter passes cache-friendly, and is trivially transferable to workers.

**Pure functions throughout.** Every module except `viewer.ts` exports only pure functions and immutable constants. This makes property-based testing straightforward: fast-check generates arbitrary inputs and the functions have no external dependencies to mock.

**Interpreter returns a new matrix; it does not mutate the page.** The display cell grid and the raw page are kept separate, so apps can apply transformations (e.g., overlaying a clock) on the raw page without touching the display pipeline.

**No streaming or event emitter in the skeleton.** Push-style updates (carousel timer, clock tick) live entirely in `viewer.ts`. The skeleton functions are synchronous and stateless; state lives in the caller.

**RLE before base64url for codec.** Teletext pages are typically sparse (many spaces and repeated colours). A single-pass RLE produces good compression without a dependency on a compression library.

**SVG by string concatenation, not a DOM builder.** The renderer must work in Node.js for testing and in browsers for display. String concatenation with manual escaping satisfies both environments and keeps the renderer dependency-free.

**`PageBuilder` as a fluent class, not a collection of standalone helpers.** Apps need to compose many operations on a single page. A class with chainable methods groups the page reference with the write operations, reduces parameter repetition, and makes the 40-column and row-23 guards enforceable in one place. The builder is the only class in the skeleton; everything else remains a pure function.

**`PageProvider` as a plain async function, not an interface.** A single function type is the smallest contract that covers both static (pre-built store) and dynamic (lazy-fetch) page sources. The viewer does not need to know whether the provider wraps a `PageStore` or calls `fetch`.

**System pages in a dedicated module, not inlined in viewer.ts.** `makeLoadingPage`, `makeNotFoundPage`, and `makeErrorPage` depend on `PageBuilder` and `fillPromptRow`. Keeping them in `system-pages.ts` means `viewer.ts` imports them as ordinary functions, and apps can call them directly when building their own error flows without pulling in the viewer.

---

## 14. Page builder (`builder.ts`) — REQ-10

### 14.1 Class structure

`PageBuilder` is a class that wraps a `RawPage` created by `createPage()` at construction time.

```
class PageBuilder {
  private page: RawPage
  constructor()
  header(pageNumber: number, serviceName: string, clockText: string): this
  title(text: string): this
  text(row: number, col: number, str: string, options?: { fg?: Colour; bg?: Colour }): this
  heading(row: number, str: string): this
  value(row: number, col: number, str: string): this
  mosaicBar(row: number, col: number, width: number, fraction: number, colour: Colour): this
  list(row: number, label: string, valueStr: string): this
  wrapText(str: string, width: number): string[]
  build(): RawPage
}
```

All mutating methods return `this` for chaining. `build()` returns a copy of the internal page via `page.slice()` so the builder can be reused.

### 14.2 Control code placement rules

Every colour or size control code occupies exactly one cell. The builder accounts for this when computing write positions:

- `header`: page number written as a left-aligned 3-digit string at col 0; service name centred in cols 3–31; clock text written at cols 32–39. No colour codes needed in the header row (row 0 inherits Alpha White from row defaults).
- `title`: col 0 = 0x0D (Double Height, set-after), col 1 = 0x06 (Alpha Cyan, set-after), text starts at col 2. Maximum visible text length = 37 characters. Row 2 is set entirely to 0x20.
- `text` with foreground colour: writes colour control byte at `col`, text starts at `col + 1`. With background colour: writes background colour byte at `col + 1` (after setting foreground), then 0x1D (New Background, set-at) at `col + 1`, text starts at `col + 2`. The hard cap at column 39 is enforced after accounting for control code cells; overflow is marked with `>` at column 38 (leaving col 39 always available for a trailing control code slot if needed).
- `heading`: col 0 = 0x03 (Alpha Yellow), text from col 1, maximum 38 characters visible.
- `value`: writes 0x07 (Alpha White) then text; maximum 38 characters visible.
- `mosaicBar`: col 0 = mosaic colour control byte (`0x10 + colour`), then `Math.round(clamp(fraction, 0, 1) * width)` cells of `encodeBlockMask(0x3F)`, then `width - filledCount` cells of `encodeBlockMask(0)`. Total cells written = `width + 1` (one for the colour control byte plus `width` mosaic cells). The caller must ensure `col + width + 1 <= 40`.
- `list`: label written with 0x02 (Alpha Green) at col 0, value written right-aligned at col 39 - value length. If label and value overlap, the label is truncated to leave room for the value.

### 14.3 `wrapText` algorithm

```
wrapText(str: string, width: number): string[]
```

1. Split `str` on whitespace into words.
2. Accumulate words into the current line. If adding the next word (plus a space separator) would exceed `width`, push the current line and start a new one.
3. Words longer than `width` are hard-split at exactly `width` characters; the remainder starts the next line.
4. Return the array of lines. An empty input returns `['']`.

This is a pure method; it does not write to the page.

### 14.4 Row 23 guard

Every method that writes to the page checks `if (row === 23) return this` before writing. This applies to `text`, `heading`, `value`, `mosaicBar`, and `list`. The `title` method only writes rows 1 and 2 so no guard is needed there.

---

## 15. Built-in system pages (`system-pages.ts`) — REQ-12

All three functions are pure. They create a new `PageBuilder`, call the appropriate builder methods, and return `build()`.

### 15.1 `makeLoadingPage(pageNumber: number): RawPage`

```
new PageBuilder()
  .header(pageNumber, 'Loading...', '')
  .value(5, 0, 'Loading...')
  .build()
```

Row 23 is left entirely as 0x20 (blank). No `fillPromptRow` call is made.

### 15.2 `makeNotFoundPage(pageNumber: number): RawPage`

```
new PageBuilder()
  .header(pageNumber, 'Not Found', '')
  .text(2, 0, `PAGE ${String(pageNumber).padStart(3, '0')} NOT FOUND`, { fg: 1 })
  .text(4, 0, 'Enter a page number (100-899)')
  .build()
```

Row 23 is left entirely as 0x20 (blank).

### 15.3 `makeErrorPage(title: string, message: string, fastext: FastextConfig): RawPage`

1. Start a `PageBuilder`.
2. Write the title as a double-height red title on rows 1–2: col 0 = 0x0D, col 1 = 0x01 (Alpha Red), text from col 2.
3. Wrap `message` with `wrapText(message, 38)` and write each line to successive rows starting at row 4, up to row 21.
4. Write `fillPromptRow(fastext, labels)` bytes directly into row 23 using `setCell`.
5. Return `build()`.

The `labels` for the Fastext row default to the string representation of each linked page number, or a four-space blank if the link is absent.
