# quake-desk tasks

Implementation checklist for `apps/quake-desk/`. Each task is small and independently verifiable. Every implementation task is paired with a test task. Property-based tests use Vitest + fast-check and cover all [PBT]-tagged acceptance criteria.

Tasks are ordered so that pure utility modules are implemented first, page builders second, and wiring last.

---

## Phase 0 — Project scaffold

- [ ] **T-0.1** Create `apps/quake-desk/package.json` with `name: "quake-desk"`, `type: "module"`, and devDependencies for `vitest`, `fast-check`, and `vite`. Add `@skeletext/core` as a workspace dependency.
- [ ] **T-0.2** Create `apps/quake-desk/tsconfig.json` with `strict: true`, `target: "ES2022"`, `module: "NodeNext"`, `lib: ["ES2022", "DOM"]`.
- [ ] **T-0.3** Add `apps/quake-desk/vite.config.ts` configured for a static browser build. Set `base: './'` for relative asset paths.
- [ ] **T-0.4** Add a `vitest.config.ts` at `apps/quake-desk/` root covering `apps/quake-desk/test/**/*.test.ts`.

---

## Phase 1 — Shared types

- [ ] **T-1.1** Implement `apps/quake-desk/src/types.ts`: define and export `QuakeFeature`, `FeedResult`, and `AppState` as described in design §2. No logic; no tests needed for types alone.

---

## Phase 2 — Magnitude colour (`colour.ts`) — REQ-10

- [ ] **T-2.1** Implement `magnitudeColour(mag: number): number` in `apps/quake-desk/src/colour.ts` using the thresholds from design §4.
- [ ] **T-2.2** Write `apps/quake-desk/test/colour.test.ts`:
  - Unit: `magnitudeColour(4.9)` === 0x07, `magnitudeColour(5.0)` === 0x03, `magnitudeColour(6.0)` === 0x01.
  - Unit: `magnitudeColour(0)` === 0x07, `magnitudeColour(10)` === 0x01.
  - **[PBT REQ-10.1]** `fc.float({min: 0, max: 10})`: result is one of `[0x07, 0x03, 0x01]`; boundary at 5.0 gives 0x03; boundary at 6.0 gives 0x01.

---

## Phase 3 — Mosaic bar helpers (`bar.ts`) — REQ-8, REQ-9

- [ ] **T-3.1** Implement `barWidth`, `mosaicColour`, and `drawBar` in `apps/quake-desk/src/bar.ts` as described in design §5.
- [ ] **T-3.2** Write `apps/quake-desk/test/bar.test.ts`:
  - Unit: `barWidth(0, 10, 28)` === 0.
  - Unit: `barWidth(10, 10, 28)` === 28.
  - Unit: `mosaicColour(0x01)` === 0x11, `mosaicColour(0x06)` === 0x16.
  - Unit: `drawBar` on a fresh `createPage()` writes exactly `widthCols` non-space bytes on the target row.
  - **[PBT REQ-8.3 / REQ-9.2]** `fc.float({min:0,max:10})` as magnitude: bar width is in [0, 28]; every mosaic byte written has `byte & 0x20 === 0x20`.

---

## Phase 4 — Feed fetching (`fetch.ts`) — REQ-1, REQ-2

- [ ] **T-4.1** Implement `fetchFeed` and `parseFeature` in `apps/quake-desk/src/fetch.ts`. Use `AbortController` for the 8-second timeout. Throw `FetchError` on network error, timeout, or non-2xx status.
- [ ] **T-4.2** Write `apps/quake-desk/test/fetch.test.ts` using Vitest's `vi.stubGlobal` to mock `fetch`:
  - Unit: a successful mock response parses into the correct `FeedResult` shape.
  - Unit: a mock that returns HTTP 500 causes `fetchFeed` to throw `FetchError`.
  - Unit: a mock that never resolves causes `fetchFeed` to throw `FetchError` after the timeout (use Vitest fake timers).
  - **[PBT REQ-1.3]** `fc.record({...})` generating arbitrary feature-shaped objects with the required fields: `parseFeature` never throws for any valid-shaped input.

---

## Phase 5 — Error and not-found page builders — REQ-2, REQ-3

- [ ] **T-5.1** Implement `buildErrorPage` in `apps/quake-desk/src/pages/error.ts`.
- [ ] **T-5.2** Implement `buildNotFoundPage` in `apps/quake-desk/src/pages/notfound.ts`.
- [ ] **T-5.3** Write `apps/quake-desk/test/pages/error.test.ts` and `apps/quake-desk/test/pages/notfound.test.ts`:
  - Unit: `buildErrorPage` returns a 960-byte page (24×40 from `@skeletext/core`).
  - Unit: the page contains the feed URL string (check the byte sequence).
  - Unit: `buildNotFoundPage(142)` produces a page whose byte sequence contains the ASCII for `142`.

---

## Phase 6 — Index page (100) — REQ-4

- [ ] **T-6.1** Implement `buildIndexPage` in `apps/quake-desk/src/pages/index.ts`. Write the double-height title row using byte 0x0D then 0x03 then the title text.
- [ ] **T-6.2** Write `apps/quake-desk/test/pages/index.test.ts`:
  - Unit: row 1 of the returned page starts with 0x0D (Double Height).
  - Unit: row 2 cells are all 0x20 (blank lower double-height row — page builder must write blank row 2).
  - Unit: row 23 starts with 0x01 (Fastext red link byte).
  - Unit: with `state.day = null`, row 4 contains the bytes for `Loading`.

---

## Phase 7 — List pages (101, 102) — REQ-5, REQ-6

- [ ] **T-7.1** Implement `buildListSubpages` in `apps/quake-desk/src/pages/list.ts`.
- [ ] **T-7.2** Write `apps/quake-desk/test/pages/list.test.ts`:
  - Unit: 0 events → 1 subpage with `No events` somewhere in the bytes.
  - Unit: 10 events → 1 subpage with all 10 rows filled.
  - Unit: 11 events → 2 subpages.
  - Unit: each event row starts with a magnitude colour byte (one of 0x07, 0x03, 0x01).
  - **[PBT REQ-5.5]** `fc.array(fc.record({mag: fc.float(...), ...}), {maxLength: 200})`: subpage count equals `Math.max(1, Math.ceil(n / 10))`.

---

## Phase 8 — Detail pages (110–119) — REQ-7

- [ ] **T-8.1** Implement `buildDetailPage` in `apps/quake-desk/src/pages/detail.ts`.
- [ ] **T-8.2** Write `apps/quake-desk/test/pages/detail.test.ts`:
  - Unit: row 3 contains the magnitude colour byte followed by the magnitude value bytes.
  - Unit: row 8 contains 0x01 (Alpha Red) when `tsunami === 1`.
  - Unit: row 8 contains 0x07 (Alpha White) when `tsunami === 0`.
  - Unit: the returned page is exactly 960 bytes.
  - Unit: no row exceeds 40 bytes (verify by reading each row with `getRow` from `@skeletext/core`).

---

## Phase 9 — Histogram page (120) — REQ-8

- [ ] **T-9.1** Implement `buildHistogramPage` in `apps/quake-desk/src/pages/histogram.ts`.
- [ ] **T-9.2** Write `apps/quake-desk/test/pages/histogram.test.ts`:
  - Unit: an empty event list returns a valid 960-byte page without throwing.
  - Unit: all events in the same bin produce one bar row with the correct count.
  - Unit: row 1 contains the bytes for `MAGNITUDE`.
  - **[PBT REQ-8.3]** `fc.array(fc.float({min:4.0, max:9.9}), {minLength:1})` as magnitudes: every bar-byte in the page has `byte & 0x20 === 0x20`; every label written is exactly 8 bytes wide on its row.

---

## Phase 10 — About page (199) — REQ-11

- [ ] **T-10.1** Implement `buildAboutPage` in `apps/quake-desk/src/pages/about.ts`.
- [ ] **T-10.2** Write `apps/quake-desk/test/pages/about.test.ts`:
  - Unit: the page is 960 bytes.
  - Unit: the bytes for `USGS` appear somewhere in the page.
  - Unit: no row exceeds 40 bytes.

---

## Phase 11 — Router wiring (`router.ts`) — REQ-12, REQ-13

- [ ] **T-11.1** Implement `buildStore` and `startAppCarousel` in `apps/quake-desk/src/router.ts`.
- [ ] **T-11.2** Write `apps/quake-desk/test/router.test.ts`:
  - Unit: `buildStore` with a minimal `AppState` registers pages 100, 101, 102, 120, 199.
  - Unit: navigating to page 115 with fewer than 6 day-feed events returns the not-found page.
  - Unit: the carousel stop function returned by `startAppCarousel` prevents further ticks (use Vitest fake timers).
  - **[PBT REQ-13.3]** `fc.integer({min:1, max:50})` ticks on a store with known subpage counts: current subpage index is always within range.

---

## Phase 12 — Entry point (`main.ts`) — REQ-1, REQ-14

- [ ] **T-12.1** Implement `main.ts` and `index.html` as described in design §8. Wire `startViewer` from `@skeletext/core`. No tests needed for the DOM wiring; a manual browser test is sufficient.

---

## Phase 13 — Integration and build

- [ ] **T-13.1** Run `vitest run` for `apps/quake-desk/` and confirm all tests pass with zero failures.
- [ ] **T-13.2** Run `tsc --noEmit` and confirm zero TypeScript errors.
- [ ] **T-13.3** Run `vite build` and confirm the output directory contains `index.html` and at least one `.js` bundle with no server-side script files.
- [ ] **T-13.4** Serve the build output locally (e.g. `npx serve dist`) and confirm pages 100, 101, 120, and 199 render without console errors. Verify the Fastext row is visible on each page.
