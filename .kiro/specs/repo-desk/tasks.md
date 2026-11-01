# repo-desk tasks

Implementation checklist for `apps/repo-desk/`. Each task is small and independently verifiable. Every implementation task is paired with a test task. Property-based tests use Vitest + fast-check and cover all [PBT]-tagged acceptance criteria.

Tasks are ordered so that pure utility modules are implemented first, page builders second, and wiring last.

> Status note (2026-10-31): Kiro (qwen3-coder-next, custom agent, V3 engine) started this app and was stopped after about 19 minutes. Its partial output is in the git history (commit "Kiro run E2"). It was slow, added vite and a second esbuild although told not to, and its page layouts overlapped because text() uses two control cells that it did not count. The app was then written by hand against this spec with the same architecture as quake-desk (createProvider plus mountTeletext, esbuild). Deviations: no separate error, invalid and rate-limit page builders, the skeleton viewer shows errors from the provider's messages. Deployed to https://skeletext-repo-desk.vercel.app. See docs/HOW-KIRO-WAS-USED.md.

---

## Phase 0 — Project scaffold

- [x] **T-0.1** Create `apps/repo-desk/package.json` with `name: "repo-desk"`, `type: "module"`, and devDependencies for `vitest`, `fast-check`, and `vite`. Add `@skeletext/core` as a workspace dependency.
- [x] **T-0.2** Create `apps/repo-desk/tsconfig.json` with `strict: true`, `target: "ES2022"`, `module: "NodeNext"`, `lib: ["ES2022", "DOM"]`.
- [x] **T-0.3** Add `apps/repo-desk/vite.config.ts` configured for a static browser build. Set `base: './'` for relative asset paths.
- [x] **T-0.4** Add a `vitest.config.ts` at `apps/repo-desk/` root covering `apps/repo-desk/test/**/*.test.ts`.

---

## Phase 1 — Shared types

- [x] **T-1.1** Implement `apps/repo-desk/src/types.ts`: define and export `RepoData`, `CommitItem`, `PullItem`, `IssueItem`, `RunItem`, and `AppState` as described in design §2. No logic; no tests needed for types alone.

---

## Phase 2 — Query parameter parsing and URL builder (`param.ts`) — REQ-1, REQ-2

- [x] **T-2.1** Implement `parseRepoParam` and `buildApiUrl` in `apps/repo-desk/src/param.ts` as described in design §3.
- [x] **T-2.2** Write `apps/repo-desk/test/param.test.ts`:
  - Unit: `parseRepoParam('?repo=torvalds/linux')` returns `{ owner: 'torvalds', name: 'linux' }`.
  - Unit: `parseRepoParam('')` returns the default `{ owner: 'rishabhcli', name: 'skeletext' }`.
  - Unit: `parseRepoParam('?repo=')` returns the default owner/name.
  - Unit: `parseRepoParam('?repo=noslash')` returns `null` (REQ-1.4).
  - Unit: `parseRepoParam('?repo=a/b/c')` returns `null` (more than one slash).
  - Unit: `buildApiUrl('torvalds', 'linux', '/commits')` equals `https://api.github.com/repos/torvalds/linux/commits`.
  - **[PBT REQ-1.5]** `fc.string()` for both owner and name (non-empty): `parseRepoParam('?repo=' + owner + '/' + name)` returns `{ owner, name }` without throwing.
  - **[PBT REQ-2.5]** `fc.string()` for owner and name: `buildApiUrl(owner, name, '/commits')` starts with `https://api.github.com/repos/` and contains no unencoded spaces.

---

## Phase 3 — localStorage cache (`cache.ts`) — REQ-6

- [x] **T-3.1** Implement `isCacheValid`, `readCache`, and `writeCache` in `apps/repo-desk/src/cache.ts` as described in design §4.
- [x] **T-3.2** Write `apps/repo-desk/test/cache.test.ts`:
  - Unit: `isCacheValid({ data: {}, timestamp: now - 299_999 }, now)` is true.
  - Unit: `isCacheValid({ data: {}, timestamp: now - 300_000 }, now)` is false.
  - Unit: `isCacheValid({ data: {}, timestamp: now - 300_001 }, now)` is false.
  - Unit: `writeCache` then `readCache` for the same key returns an entry with matching `data`.
  - Unit: `readCache` for an unknown key returns null.
  - Unit: `writeCache` does not throw when `localStorage` throws (use `vi.stubGlobal` to make `localStorage.setItem` throw).
  - **[PBT REQ-6.2]** `fc.integer()` for `timestamp`, `fc.integer()` for `now`: `isCacheValid({ data: {}, timestamp }, now)` returns true iff `now - timestamp < 300_000`.

---

## Phase 4 — Formatting helpers (`format.ts`) — REQ-8

- [x] **T-4.1** Implement `formatAge`, `formatDate`, `formatDatetime`, `truncate`, `padLeft`, and `padRight` in `apps/repo-desk/src/format.ts`.
- [x] **T-4.2** Write `apps/repo-desk/test/format.test.ts`:
  - Unit: `formatAge(0)` === `just now`.
  - Unit: `formatAge(59_999)` === `just now`.
  - Unit: `formatAge(60_000)` === `1 minutes ago`.
  - Unit: `formatAge(3_600_000)` === `1 hours ago`.
  - Unit: `formatAge(86_400_000)` === `1 days ago`.
  - Unit: `formatDate('2024-03-15T10:00:00Z')` === `03-15`.
  - Unit: `formatDatetime('2024-03-15T10:30:00Z')` === `03-15 10:30`.
  - Unit: `truncate('hello world', 5)` === `hello`.
  - Unit: `padLeft('42', 6)` === `    42`.
  - Unit: `padRight('hi', 5)` === `hi   `.
  - **[PBT REQ-8.4]** `fc.integer({ min: 0 })` as `ageMs`: `formatAge(ageMs)` returns a string of 1 to 20 characters.

---

## Phase 5 — Mosaic bar helpers (`bar.ts`) — REQ-13

- [x] **T-5.1** Implement `barWidth` and `drawBar` in `apps/repo-desk/src/bar.ts` as described in design §7.
- [x] **T-5.2** Write `apps/repo-desk/test/bar.test.ts`:
  - Unit: `barWidth(0, 100, 20)` === 0.
  - Unit: `barWidth(100, 100, 20)` === 20.
  - Unit: `barWidth(50, 100, 20)` === 10.
  - Unit: `barWidth(0, 0, 20)` === 0 (guards against division by zero).
  - Unit: `drawBar` on a fresh `createPage()` writes exactly `widthCols` non-space bytes on the target row (verify with `getRow` from `@skeletext/core`).
  - **[PBT REQ-13.7]** `fc.record({ bytes: fc.dictionary(fc.string(), fc.integer({ min: 1 })), maxEntries: 10 })`: every mosaic byte written by `drawBar` satisfies `byte & 0x20 === 0x20`.

---

## Phase 6 — Error and special page builders — REQ-3, REQ-4, REQ-5, REQ-7

- [x] **T-6.1** Implement `buildInvalidRepoPage` in `apps/repo-desk/src/pages/invalid.ts`.
- [x] **T-6.2** Implement `buildRateLimitPage` and `formatResetTime` in `apps/repo-desk/src/pages/ratelimit.ts`.
- [x] **T-6.3** Implement `buildFetchErrorPage` in `apps/repo-desk/src/pages/error.ts`.
- [x] **T-6.4** Implement `buildLoadingPage` in `apps/repo-desk/src/pages/loading.ts`.
- [x] **T-6.5** Write `apps/repo-desk/test/pages/error.test.ts`:
  - Unit: `buildInvalidRepoPage('bad')` returns a 960-byte page containing the ASCII bytes for `bad`.
  - Unit: `buildRateLimitPage('1735600000')` returns a 960-byte page containing the bytes for `HH:MM:SS UTC`.
  - Unit: `buildRateLimitPage(null)` returns a page containing the bytes for `unavailable`.
  - Unit: `buildFetchErrorPage('Page 110: commits', 'timeout')` returns a 960-byte page containing `timeout`.
  - Unit: `buildLoadingPage(110)` returns a page whose row 0 starts with the bytes for `110`.
  - Unit: no returned page has any row exceeding 40 bytes (verify with `getRow` from `@skeletext/core`).

---

## Phase 7 — Index page (100) — REQ-8

- [x] **T-7.1** Implement `buildIndexPage` in `apps/repo-desk/src/pages/index.ts`.
- [x] **T-7.2** Write `apps/repo-desk/test/pages/index.test.ts`:
  - Unit: row 1 of the returned page contains 0x0D (Double Height) at column 0.
  - Unit: row 1 contains 0x06 (Alpha Cyan) at column 1.
  - Unit: row 2 is all 0x20 (blank double-height lower row).
  - Unit: row 23 starts with 0x01 (Fastext red).
  - Unit: with `state.repo = null`, row 4 contains the bytes for `Loading`.
  - Unit: with a `RepoData` whose `pushedAt` is 1 minute ago, row 11 contains the bytes for `minutes ago`.

---

## Phase 8 — Commits page (110) — REQ-9

- [x] **T-8.1** Implement `buildCommitSubpages` in `apps/repo-desk/src/pages/commits.ts`.
- [x] **T-8.2** Write `apps/repo-desk/test/pages/commits.test.ts`:
  - Unit: always returns exactly 2 `RawPage` values regardless of commit count.
  - Unit: each returned page is 960 bytes.
  - Unit: with 20 commits, each subpage has non-space bytes in rows 3–12.
  - Unit: with 5 commits, subpage 1 has data in rows 3–7 and blanks in rows 8–12; subpage 2 is all blank in rows 3–12.
  - Unit: row 1 of subpage 0 ends with `1/2` bytes.
  - Unit: row 1 of subpage 1 ends with `2/2` bytes.
  - **[PBT REQ-9.7]** `fc.string()` as commit message: the bytes written for one commit row total exactly 40.

---

## Phase 9 — Pulls page (120) — REQ-10

- [x] **T-9.1** Implement `buildPullsPage` in `apps/repo-desk/src/pages/pulls.ts`.
- [x] **T-9.2** Write `apps/repo-desk/test/pages/pulls.test.ts`:
  - Unit: an empty list returns a page containing `No open pull requests`.
  - Unit: a list of 1 PR produces a row at row 3 with non-space bytes.
  - Unit: the page is 960 bytes.
  - **[PBT REQ-10.3]** `fc.string()` for title, `fc.integer({ min: 1, max: 99999 })` for number: the bytes written for that PR row total exactly 40.

---

## Phase 10 — Issues page (130) — REQ-11

- [x] **T-10.1** Implement `buildIssuesPage` in `apps/repo-desk/src/pages/issues.ts`.
- [x] **T-10.2** Write `apps/repo-desk/test/pages/issues.test.ts`:
  - Unit: an empty list returns a page containing `No open issues`.
  - Unit: the page is 960 bytes.
  - **[PBT REQ-11.3]** `fc.string()` for title, `fc.integer({ min: 1, max: 99999 })` for number: the bytes written for that issue row total exactly 40.

---

## Phase 11 — Actions page (140) — REQ-12

- [x] **T-11.1** Implement `buildActionsPage`, `runColour`, and `runIndicator` in `apps/repo-desk/src/pages/actions.ts`.
- [x] **T-11.2** Write `apps/repo-desk/test/pages/actions.test.ts`:
  - Unit: a run with `conclusion === 'success'` produces 0x02 (Alpha Green) at column 0 of its row.
  - Unit: a run with `conclusion === 'failure'` produces 0x01 (Alpha Red) at column 0.
  - Unit: a run with `status === 'in_progress'` and `conclusion === null` produces 0x03 (Alpha Yellow) at column 0.
  - Unit: an empty list returns a page containing `No workflow runs`.
  - Unit: the page is 960 bytes.
  - **[PBT REQ-12.6]** `fc.string()` for name, `fc.string()` for branch: the bytes written for that run row total exactly 40.

---

## Phase 12 — Languages page (150) — REQ-13

- [x] **T-12.1** Implement `buildLanguagesPage` in `apps/repo-desk/src/pages/languages.ts`.
- [x] **T-12.2** Write `apps/repo-desk/test/pages/languages.test.ts`:
  - Unit: an empty record returns a page containing `No language data`.
  - Unit: a single language `{ TypeScript: 10000 }` produces a bar of 20 mosaic cells on row 3.
  - Unit: the page is 960 bytes.
  - **[PBT REQ-13.6]** `fc.dictionary(fc.string({ minLength: 1 }), fc.integer({ min: 1 }), { minKeys: 1, maxKeys: 10 })`: the sum of computed percentages is between 99.0 and 101.0.
  - **[PBT REQ-13.7]** Same input: every mosaic byte written to the page by `drawBar` satisfies `byte & 0x20 === 0x20`.

---

## Phase 13 — About page (199) — REQ-14

- [x] **T-13.1** Implement `buildAboutPage` in `apps/repo-desk/src/pages/about.ts`.
- [x] **T-13.2** Write `apps/repo-desk/test/pages/about.test.ts`:
  - Unit: the page is 960 bytes.
  - Unit: the page contains the bytes for `REPO DESK`.
  - Unit: the page contains the bytes for `api.github.com`.
  - Unit: no row exceeds 40 bytes.

---

## Phase 14 — API fetch module (`fetch.ts`) — REQ-2, REQ-6, REQ-7

- [x] **T-14.1** Implement `fetchJson` and `makeFetcher` in `apps/repo-desk/src/fetch.ts` as described in design §5, using the cache from `cache.ts` and the URL builder from `param.ts`.
- [x] **T-14.2** Write `apps/repo-desk/test/fetch.test.ts` using `vi.stubGlobal` to mock `fetch`:
  - Unit: a successful response is parsed, returned, and written to the cache.
  - Unit: a second call with a warm cache returns without calling `fetch`.
  - Unit: HTTP 403 throws `RateLimitError`; the `resetHeader` field matches the `X-RateLimit-Reset` header value.
  - Unit: HTTP 429 throws `RateLimitError`.
  - Unit: HTTP 404 throws `FetchError` with reason `HTTP 404`.
  - Unit: a never-resolving fetch throws `FetchError` with reason `timeout` after 8 seconds (use Vitest fake timers).

---

## Phase 15 — Router and lazy fetch wiring (`router.ts`) — REQ-15, REQ-16

- [x] **T-15.1** Implement `setupRouter` and `startAppCarousel` in `apps/repo-desk/src/router.ts` as described in design §9.
- [x] **T-15.2** Write `apps/repo-desk/test/router.test.ts`:
  - Unit: `setupRouter` with a minimal `AppState` registers pages 100, 110, 120, 130, 140, 150, 199.
  - Unit: navigating to page 110 with `commits === null` immediately shows the loading placeholder (page content contains `Loading`).
  - Unit: after a mocked lazy fetch resolves, navigating to page 110 again shows commit data (not `Loading`).
  - Unit: the `AbortController` for a page-110 fetch is aborted when the user navigates away before the fetch resolves.
  - Unit: the carousel stop function prevents further ticks (use Vitest fake timers).
  - **[PBT REQ-16.3]** `fc.integer({ min: 0, max: 100 })` ticks: subpage index for page 110 is always 0 or 1.

---

## Phase 16 — Entry point (`main.ts`) — REQ-1, REQ-17

- [x] **T-16.1** Implement `main.ts` and `index.html` as described in design §10. No tests needed for DOM wiring; a manual browser test is sufficient.

---

## Phase 17 — Integration and build

- [x] **T-17.1** Run `vitest run` for `apps/repo-desk/` and confirm all tests pass with zero failures.
- [x] **T-17.2** Run `tsc --noEmit` and confirm zero TypeScript errors.
- [x] **T-17.3** Run `vite build` and confirm the output directory contains `index.html` and at least one `.js` bundle with no server-side script files.
- [x] **T-17.4** Serve the build output locally and confirm pages 100, 110, 150, and 199 render correctly for the default repo (`rishabhcli/skeletext`). Confirm the rate-limit page appears when navigating rapidly.
