# quake-desk design

This document describes the module structure, data types, and algorithms for `apps/quake-desk/`. It is derived from `requirements.md` and constrained by the skeleton public API in `@skeletext/core`. No code is written here.

---

## 1. Package layout

```
apps/quake-desk/
  src/
    types.ts        — app-specific data types (QuakeFeature, FeedResult)
    fetch.ts        — feed fetching with timeout (REQ-1, REQ-2)
    pages/
      index.ts      — page 100 builder (REQ-4)
      list.ts       — pages 101 and 102 builders (REQ-5, REQ-6)
      detail.ts     — pages 110–119 builder (REQ-7)
      histogram.ts  — page 120 builder (REQ-8)
      about.ts      — page 199 builder (REQ-11)
      error.ts      — error page builder (REQ-2)
      notfound.ts   — not-found page builder (REQ-3)
    colour.ts       — magnitude colour function (REQ-10)
    bar.ts          — mosaic bar drawing helpers (REQ-9)
    router.ts       — PageStore setup and carousel wiring (REQ-12, REQ-13)
    main.ts         — entry point: fetch → build pages → start viewer
  test/
    fetch.test.ts
    colour.test.ts
    bar.test.ts
    pages/
      index.test.ts
      list.test.ts
      detail.test.ts
      histogram.test.ts
  index.html
  package.json
  tsconfig.json
  vite.config.ts    — static build config
```

All imports of skeleton functionality use `import { … } from '@skeletext/core'`. No other local packages are imported.

---

## 2. Data types (`types.ts`)

```
QuakeFeature {
  id:          string          // last path segment of url
  mag:         number
  place:       string
  time:        number          // ms since epoch
  url:         string
  felt:        number | null
  alert:       string | null
  tsunami:     0 | 1
  sig:         number
  lon:         number          // geometry.coordinates[0]
  lat:         number          // geometry.coordinates[1]
  depth:       number          // geometry.coordinates[2], km
}

FeedResult {
  features:    QuakeFeature[]
  generated:   number          // ms since epoch, from metadata.generated
}

AppState {
  day:         FeedResult | null
  week:        FeedResult | null
  error:       { feed: string; reason: string } | null
}
```

`QuakeFeature` is a plain object produced by `parseFeature(raw: GeoJSONFeature): QuakeFeature`. The parser is a pure function (REQ-1.3).

---

## 3. Feed fetching (`fetch.ts`) — REQ-1, REQ-2

### 3.1 `fetchFeed(url: string, timeoutMs: number): Promise<FeedResult>`

1. Create an `AbortController`. Set `setTimeout(() => controller.abort(), timeoutMs)`.
2. Call `fetch(url, { signal: controller.signal })`.
3. On timeout or network error: throw `FetchError(url, reason)`.
4. On HTTP status outside 200–299: throw `FetchError(url, \`HTTP \${status}\`)`.
5. Parse the response as JSON. Map each `features` entry through `parseFeature`. Return `FeedResult`.

### 3.2 `parseFeature(raw: unknown): QuakeFeature`

A pure function. Reads `raw.properties` and `raw.geometry.coordinates`. The event id is `raw.id` (GeoJSON feature id field). Returns a `QuakeFeature`. Throws `ParseError` if required fields are missing or have unexpected types.

### 3.3 Error types

`FetchError` and `ParseError` are subclasses of `Error` with a `feedUrl` field so the error page (REQ-2) can display the failing feed.

---

## 4. Magnitude colour (`colour.ts`) — REQ-10

`magnitudeColour(mag: number): number`

A pure function returning a control byte:
- mag < 5.0 → `0x07` (Alpha White)
- 5.0 ≤ mag < 6.0 → `0x03` (Alpha Yellow)
- mag ≥ 6.0 → `0x01` (Alpha Red)

Uses strict IEEE 754 comparison; the boundary values 5.0 and 6.0 are Yellow and Red respectively (≥ not >).

---

## 5. Mosaic bar helpers (`bar.ts`) — REQ-8, REQ-9

### 5.1 `drawBar(page: RawPage, row: number, colStart: number, widthCols: number, colourByte: number): void`

Writes `widthCols` mosaic bytes starting at `(row, colStart)` on the given page. Each byte is produced by `encodeBlockMask(0x3F)` (all six blocks filled) preceded by the `colourByte` (a mosaic colour control byte, 0x11–0x17). Uses `setCell` from `@skeletext/core`.

### 5.2 `mosaicColour(alphaByte: number): number`

Maps an alpha colour control byte (0x01–0x07) to the corresponding mosaic colour control byte (0x11–0x17). The offset is always +0x10.

### 5.3 `barWidth(value: number, maxValue: number, maxCols: number): number`

Pure function: `Math.round((value / maxValue) * maxCols)`. Returns 0 when `maxValue` is 0 or `value` is 0.

---

## 6. Page builders

All page builders are pure functions with this signature pattern:

```
buildXxxPage(data: AppState): RawPage
buildXxxPage(data: AppState, index: number): RawPage   // for detail/list pages
```

They call `createPage`, `setCell`, `fillPromptRow`, `encodeBlockMask` from `@skeletext/core` and helpers from `colour.ts` and `bar.ts`. They never call `fetch` or access the DOM.

### 6.1 `writeText(page: RawPage, row: number, col: number, text: string): void`

A local helper (not exported) that writes a string into the page byte by byte. Characters outside 0x20–0x7F are replaced with a space. The caller is responsible for ensuring col + text.length ≤ 40.

### 6.2 `writePadded(page: RawPage, row: number, col: number, text: string, width: number): void`

Truncates `text` to `width` and pads with spaces on the right before writing.

### 6.3 Index page (page 100) — REQ-4

`buildIndexPage(state: AppState): RawPage`

- Row 0: `100  QUAKE DESK           HH:MM:SS` (clock updated separately).
- Row 1: Double Height control byte (0x0D), then Alpha Yellow (0x03), then `QUAKE DESK`.
- Row 2: left blank (double-height lower row).
- Row 4: `Data: YYYY-MM-DD HH:MM UTC` from `state.day.generated` or `Loading...` if null.
- Rows 6–12: page directory.
- Row 23: Fastext prompt (red 100, green 101, yellow 120, cyan 199).

### 6.4 List pages (101, 102) — REQ-5, REQ-6

`buildListSubpages(events: QuakeFeature[], pageNum: number): RawPage[]`

1. Sort events by descending `mag`.
2. Chunk into groups of 10.
3. For each chunk, call `createPage()` and fill rows 3–12 (one event per row).
4. Row 2 of each subpage: `Page N of M` right-aligned.
5. Each event row: `magnitudeColour(mag)` byte, mag formatted as `M.N`, two spaces, place truncated to 25, two spaces, time as `HH:MM`.
6. Return the array of `RawPage` values. If no events: return one page with `No events` on row 5.

### 6.5 Detail pages (110–119) — REQ-7

`buildDetailPage(event: QuakeFeature, rank: number): RawPage`

Writes each field row as described in REQ-7. Alert colour mapping: `green` → 0x02, `yellow` → 0x03, `orange` → 0x01 (closest available), `red` → 0x01; unknown strings → 0x07.

### 6.6 Histogram page (120) — REQ-8

`buildHistogramPage(events: QuakeFeature[]): RawPage`

1. Find min and max bin from event magnitudes. Bins are `[floor(mag*2)/2, floor(mag*2)/2 + 0.5)`.
2. Count events per bin.
3. Find `maxCount` for bar scaling.
4. For each bin row r (starting at row 3): write label in 8 chars, draw bar with `drawBar`, write count right-aligned in 4 chars.
5. Maximum usable rows: 18 (rows 3–20 available, with row 1 for title and row 23 for Fastext).

### 6.7 About page (199) — REQ-11

`buildAboutPage(state: AppState): RawPage`

Static text with feed URLs, generation times from `state`, and the public-domain note.

### 6.8 Error page — REQ-2

`buildErrorPage(feedUrl: string, reason: string): RawPage`

Single-page error. Row 2: `FETCH ERROR` in Alpha Red. Row 4: feed URL (truncated). Row 6: reason string (truncated to 40).

### 6.9 Not-found page — REQ-3

`buildNotFoundPage(requested: number): RawPage`

Row 2: `PAGE NNN NOT FOUND`. Row 4: `Enter a page number (100–899)`.

---

## 7. Router setup (`router.ts`) — REQ-12, REQ-13

`buildStore(state: AppState): PageStore`

1. Call `createPage`-based builders for each page.
2. Assemble a `PageStore` using the `@skeletext/core` store API.
3. Register pages 100, 101, 102, 110–119, 120, 199.
4. Register a fallback handler that returns `buildNotFoundPage(n)` for any unregistered n.

`startAppCarousel(store: PageStore, onTick: (s: PageStore) => void): () => void`

Wraps `startCarousel` from `@skeletext/core`. Returns a stop function. The caller calls the stop function before rebuilding the store after a data refresh.

---

## 8. Entry point (`main.ts`) — REQ-1, REQ-14

```
async function main() {
  const [dayResult, weekResult] = await Promise.allSettled([
    fetchFeed(DAY_URL, 8000),
    fetchFeed(WEEK_URL, 8000),
  ]);

  const state: AppState = buildState(dayResult, weekResult);
  const store = buildStore(state);
  startViewer(store);   // from @skeletext/core viewer wiring
}
```

`buildState` converts `PromiseSettledResult` pairs into `AppState`. If either feed failed, `state.error` is set. Both results are handled independently so a week-feed failure still shows day data and vice-versa where possible.

---

## 9. Build configuration

The app is built with Vite in library mode producing a single `index.html` + bundled JS. No server-side code. The `@skeletext/core` package is bundled rather than externalized so the output is a self-contained static directory.

---

## 10. Key design decisions

**Separate `AppState` from the skeleton `PageStore`.** The app builds `RawPage` values once from `AppState` and stores them in the `PageStore`. When data changes (page refresh), the store is rebuilt from scratch. This keeps all page logic as pure functions and avoids stale state.

**Pure page builders.** Every page builder is a pure function of `AppState` (or a slice of it). This makes unit testing straightforward: pass in a known `AppState` and assert on the bytes written to the page.

**Single `colour.ts` for magnitude colour.** Rather than repeating the colour rule in each page builder, a single pure function encodes it. The [PBT] test on REQ-10.1 verifies the boundaries without needing any page context.

**`drawBar` writes into a `RawPage`, not returning bytes.** Page builders already hold a `RawPage` reference; having `drawBar` write directly avoids an intermediate allocation and keeps the mosaic logic co-located with its data.

**No web workers.** The feed parsing is fast enough to run synchronously on the main thread after `await`. Workers would complicate the Vite build configuration for no measurable gain at this data size.
