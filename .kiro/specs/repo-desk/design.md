# repo-desk design

This document describes the module structure, data types, and algorithms for `apps/repo-desk/`. It is derived from `requirements.md` and constrained by the skeleton public API in `@skeletext/core`. No code is written here.

---

## 1. Package layout

```
apps/repo-desk/
  src/
    types.ts        — app-specific data types (RepoData, CommitData, etc.)
    param.ts        — query parameter parsing and URL builder (REQ-1, REQ-2)
    cache.ts        — localStorage cache (REQ-6)
    fetch.ts        — API fetching with timeout and cache (REQ-2, REQ-6, REQ-7)
    format.ts       — shared formatting helpers (formatAge, formatDate, truncate)
    bar.ts          — mosaic bar drawing for language page (REQ-13)
    pages/
      index.ts      — page 100 builder (REQ-8)
      commits.ts    — page 110 builder (REQ-9)
      pulls.ts      — page 120 builder (REQ-10)
      issues.ts     — page 130 builder (REQ-11)
      actions.ts    — page 140 builder (REQ-12)
      languages.ts  — page 150 builder (REQ-13)
      about.ts      — page 199 builder (REQ-14)
      error.ts      — generic error page builder (REQ-5)
      ratelimit.ts  — rate-limit error page builder (REQ-4)
      invalid.ts    — invalid-repo error page builder (REQ-3)
      loading.ts    — loading placeholder page builder (REQ-7)
    router.ts       — PageStore setup, lazy fetch wiring, carousel (REQ-15, REQ-16)
    main.ts         — entry point: parse params, boot viewer (REQ-1, REQ-17)
  test/
    param.test.ts
    cache.test.ts
    fetch.test.ts
    format.test.ts
    bar.test.ts
    pages/
      index.test.ts
      commits.test.ts
      pulls.test.ts
      issues.test.ts
      actions.test.ts
      languages.test.ts
      about.test.ts
      error.test.ts
  index.html
  package.json
  tsconfig.json
  vite.config.ts
```

All imports of skeleton functionality use `import { … } from '@skeletext/core'`. No other local packages are imported.

---

## 2. Data types (`types.ts`)

```
RepoData {
  fullName:    string          // "owner/name"
  description: string          // empty string if null
  stars:       number          // stargazers_count
  forks:       number          // forks_count
  openIssues:  number          // open_issues_count
  language:    string | null   // primary_language
  license:     string | null   // license.spdx_id
  pushedAt:    string          // ISO 8601 datetime string
}

CommitItem {
  sha:         string          // full 40-char SHA
  date:        string          // commit.author.date, ISO 8601
  author:      string          // user.login or commit.author.name
  message:     string          // full commit message
}

PullItem {
  number:      number
  login:       string          // user.login
  title:       string
}

IssueItem {
  number:      number
  login:       string          // user.login
  title:       string
}

RunItem {
  name:        string          // workflow name
  branch:      string          // head_branch
  status:      string          // "queued" | "in_progress" | "completed"
  conclusion:  string | null   // "success" | "failure" | "timed_out" | ...
  updatedAt:   string          // updated_at, ISO 8601
}

AppState {
  owner:       string
  name:        string
  repo:        RepoData | null
  commits:     CommitItem[] | null
  pulls:       PullItem[] | null
  issues:      IssueItem[] | null
  runs:        RunItem[] | null
  languages:   Record<string, number> | null   // language name → byte count
}
```

Null fields indicate data that has not yet been fetched or is pending. All parsers are pure functions that take `unknown` and return the typed record or throw `ParseError`.

---

## 3. Query parameter parsing and URL builder (`param.ts`) — REQ-1, REQ-2

### 3.1 `parseRepoParam(search: string): { owner: string; name: string } | null`

Reads `new URLSearchParams(search).get('repo')`. If the value is absent or empty, returns `{ owner: 'rishabhcli', name: 'skeletext' }`. If the value contains exactly one `/` with non-empty parts on both sides, returns `{ owner, name }`. Otherwise returns `null` (signals an invalid parameter; the caller shows REQ-3 error page).

### 3.2 `buildApiUrl(owner: string, name: string, path: string): string`

Returns `https://api.github.com/repos/${owner}/${name}${path}`. Both `owner` and `name` are passed through `encodeURIComponent` before interpolation.

---

## 4. localStorage cache (`cache.ts`) — REQ-6

### 4.1 Cache record

```
CacheEntry {
  data:      unknown
  timestamp: number   // Date.now() at write time
}
```

### 4.2 `isCacheValid(entry: CacheEntry, now: number): boolean`

Returns `now - entry.timestamp < 300_000` (5 minutes in milliseconds). Pure function; no side effects.

### 4.3 `readCache(url: string): CacheEntry | null`

Reads `localStorage.getItem(url)`. Parses JSON. Returns the `CacheEntry` if parsing succeeds and the `timestamp` field is a number, otherwise returns null. Any exception from `localStorage` is caught and null is returned.

### 4.4 `writeCache(url: string, data: unknown): void`

Calls `localStorage.setItem(url, JSON.stringify({ data, timestamp: Date.now() }))`. Any exception (quota exceeded, SecurityError) is caught and silently ignored (REQ-6.4).

---

## 5. API fetching (`fetch.ts`) — REQ-2, REQ-6, REQ-7

### 5.1 `fetchJson<T>(url: string, parse: (raw: unknown) => T, signal: AbortSignal): Promise<T>`

1. Check the cache: `entry = readCache(url)`. If `isCacheValid(entry, Date.now())`, return `parse(entry.data)` immediately.
2. Call `fetch(url, { signal, headers: { Accept: 'application/vnd.github+json' } })`.
3. If the response status is 403 or 429: read the `X-RateLimit-Reset` header, throw `RateLimitError(header value or null)`.
4. If the response status is outside 200–299: throw `FetchError(url, 'HTTP ' + status)`.
5. Parse the response body as JSON. Call `writeCache(url, rawJson)`. Return `parse(rawJson)`.
6. On network error or abort: throw `FetchError(url, 'network error')` or `FetchError(url, 'timeout')`.

### 5.2 `makeFetcher(owner: string, name: string, timeoutMs: number)`

Returns a helper object with methods `fetchRepo()`, `fetchCommits()`, `fetchPulls()`, `fetchIssues()`, `fetchRuns()`, `fetchLanguages()`, each of which calls `fetchJson` with the correct endpoint and parser, using an `AbortController` that fires after `timeoutMs` milliseconds.

### 5.3 Error types

```
RateLimitError extends Error {
  resetHeader: string | null   // raw X-RateLimit-Reset header value or null
}

FetchError extends Error {
  url:    string
  reason: string
}

ParseError extends Error {
  message: string
}
```

---

## 6. Formatting helpers (`format.ts`)

### 6.1 `formatAge(ageMs: number): string`

Maps a non-negative millisecond duration to a short human-readable string:
- `< 60_000`: `just now`
- `< 3_600_000`: `N minutes ago` (N = floor(ageMs / 60_000))
- `< 86_400_000`: `N hours ago`
- `< 7 * 86_400_000`: `N days ago`
- otherwise: `N weeks ago`

Maximum output length: 20 characters (safe for column budget). Pure function.

### 6.2 `formatDate(iso: string): string`

Parses an ISO 8601 string and returns `MM-DD`. Throws `RangeError` on unparseable input.

### 6.3 `formatDatetime(iso: string): string`

Returns `MM-DD HH:MM` (UTC) from an ISO 8601 string.

### 6.4 `truncate(s: string, maxLen: number): string`

Returns `s.slice(0, maxLen)`. No ellipsis appended (REQ-9.4, REQ-10.1).

### 6.5 `padLeft(s: string, width: number): string`

Returns `s` right-aligned in `width` characters, padded with spaces.

### 6.6 `padRight(s: string, width: number): string`

Returns `s` left-aligned in `width` characters, padded with spaces.

---

## 7. Mosaic bar helpers (`bar.ts`) — REQ-13

### 7.1 `barWidth(value: number, maxValue: number, maxCols: number): number`

Pure function: `Math.round((value / maxValue) * maxCols)`. Returns 0 if `maxValue` is 0.

### 7.2 `drawBar(page: RawPage, row: number, colStart: number, widthCols: number, mosaicColourByte: number): void`

Writes `mosaicColourByte` at `(row, colStart)`, then fills `widthCols` cells starting at `colStart + 1` with `encodeBlockMask(0x3F)` (all six mosaic blocks filled). Uses `setCell` from `@skeletext/core`. Does nothing if `widthCols` is 0.

---

## 8. Page builders

All page builders are pure functions of the form:

```
buildXxxPage(state: AppState): RawPage
```

They call `createPage`, `setCell`, `fillPromptRow`, `encodeBlockMask` from `@skeletext/core`, and helpers from `format.ts` and `bar.ts`. They never call `fetch` or touch the DOM.

### 8.1 `writeText(page: RawPage, row: number, col: number, text: string): void`

Local helper (not exported). Writes each character as its ASCII byte. Characters outside 0x20–0x7F are replaced with 0x20. Stops if `col` would exceed 39.

### 8.2 `writeFastext(page: RawPage): void`

Local helper. Writes the standard Fastext prompt row for this app using `fillPromptRow` from `@skeletext/core`:
- Red label: `100` linked to page 100.
- Green label: `110` linked to page 110.
- Yellow label: `140` linked to page 140.
- Cyan label: `150` linked to page 150.

### 8.3 Index page (page 100) — REQ-8

`buildIndexPage(state: AppState, now: number): RawPage`

- Row 0: `100  REPO DESK           HH:MM:SS` (clock bytes at columns 32–39 written by the viewer clock, not the builder).
- Row 1: 0x0D (Double Height), 0x06 (Alpha Cyan), then `state.owner + '/' + state.name` truncated to 37 characters.
- Row 2: blank (double-height lower row — all 0x20).
- Row 4: `state.repo.description` truncated to 40, or `Loading...` if null.
- Row 6: 0x03 (Alpha Yellow), then `Stars:    ` + star count.
- Row 7: `Forks:    ` + fork count.
- Row 8: `Issues:   ` + open issues count.
- Row 9: 0x02 (Alpha Green), then `Language: ` + language or `Unknown`.
- Row 10: `License:  ` + spdx_id or `None`.
- Row 11: `Pushed:   ` + `formatAge(now - Date.parse(state.repo.pushedAt))`.
- Row 23: Fastext prompt.

### 8.4 Commits page (page 110) — REQ-9

`buildCommitSubpages(commits: CommitItem[]): RawPage[]`

Produces exactly 2 subpages of 10 rows each (rows 3–12). Short SHA = first 7 chars of `sha`. Date = `formatDate(date)`. Author = `truncate(author, 12)`. Message first line = everything before first `\n`. The four fields are laid out to fill exactly 40 columns:
- Columns 0–6: SHA (7 chars).
- Column 7: space.
- Columns 8–12: date `MM-DD` (5 chars).
- Column 13: space.
- Columns 14–25: author padded to 12 chars.
- Column 26: space.
- Columns 27–39: message first line truncated to 13 chars.

Row 1 of each subpage: `Subpage 1/2` or `2/2` right-aligned in 40 columns.

### 8.5 Pulls page (page 120) — REQ-10

`buildPullsPage(pulls: PullItem[]): RawPage`

Rows 3–22 (up to 20 items). Per row:
- Columns 0–5: `#` then PR number right-aligned in 5 chars.
- Column 6: space.
- Columns 7–16: login truncated to 10 chars.
- Column 17: space.
- Columns 18–39: title truncated to 22 chars.

Row 5 reads `No open pull requests` if `pulls` is empty.

### 8.6 Issues page (page 130) — REQ-11

`buildIssuesPage(issues: IssueItem[]): RawPage`

Same layout as pulls page. Row 5 reads `No open issues` if `issues` is empty.

### 8.7 Actions page (page 140) — REQ-12

`buildActionsPage(runs: RunItem[]): RawPage`

Rows 3–20 (up to 18 items). Per row:
- Column 0: colour control byte (`runColour(run)`).
- Column 1: indicator character (`✓`, `✗`, `…`, or `?`) — but since G0 only supports 7-bit ASCII, use `+` for success, `X` for failure, `~` for in-progress, `?` for unknown (teletext G0 does not include Unicode check marks; ASCII substitutes are used).
- Column 2: space.
- Columns 3–22: `truncate(name, 20)`.
- Column 23: space.
- Columns 24–33: `truncate(branch, 10)`.
- Columns 34–35: two spaces.
- Columns 36–39: `formatDatetime(updatedAt)` — but this is 11 chars (`MM-DD HH:MM`); layout is adjusted: columns 3–17 for name (15), column 18 space, columns 19–25 for branch (7), columns 26–27 two spaces, columns 28–39 for datetime (12 = `MM-DD HH:MM` + space padded).

Revised layout fitting exactly 40 columns:
- Columns 0: colour byte.
- Column 1: indicator.
- Column 2: space.
- Columns 3–17: name truncated to 15.
- Column 18: space.
- Columns 19–25: branch truncated to 7.
- Columns 26–27: two spaces.
- Columns 28–39: `MM-DD HH:MM` (11 chars) + space = 12.

Row 5 reads `No workflow runs` if `runs` is empty.

`runColour(run: RunItem): number`:
- `conclusion === 'success'` → 0x02 (Alpha Green).
- `conclusion === 'failure'` or `'timed_out'` → 0x01 (Alpha Red).
- `status === 'in_progress'` or `status === 'queued'` → 0x03 (Alpha Yellow).
- otherwise → 0x07 (Alpha White).

`runIndicator(run: RunItem): number` (ASCII byte):
- success → `+` (0x2B).
- failure → `X` (0x58).
- in_progress/queued → `~` (0x7E).
- otherwise → `?` (0x3F).

### 8.8 Languages page (page 150) — REQ-13

`buildLanguagesPage(languages: Record<string, number>): RawPage`

1. Sort entries by descending byte count.
2. Compute `totalBytes` as the sum of all values.
3. Find `maxBytes` as the highest individual value.
4. For each language (rows 3 upward, up to row 21):
   - Columns 0–11: name truncated to 12 chars.
   - Column 12: space.
   - Columns 13–33: mosaic colour byte (0x17 White Mosaic) + bar using `drawBar` (max 20 cols, scaled to `maxBytes`). Bar occupies `barWidth(langBytes, maxBytes, 20)` mosaic cells.
   - Column 34: space.
   - Columns 35–39: percentage right-aligned in 5 chars (e.g. `45.2%`).
5. Row 5 reads `No language data` if `languages` is empty.

### 8.9 About page (page 199) — REQ-14

`buildAboutPage(state: AppState): RawPage`

Static layout. Row 1: `REPO DESK`. Row 3: `Data: GitHub REST API v3`. Row 4: `https://api.github.com`. Row 6: `Repo: ` + `state.owner + '/' + state.name`. Row 7: `Auth: none required`. Row 8: `Cache: 5 minutes (localStorage)`. Row 23: Fastext prompt.

### 8.10 Error pages — REQ-3, REQ-4, REQ-5

`buildInvalidRepoPage(raw: string): RawPage`
- Row 2: `INVALID REPO` in Alpha Red (0x01).
- Row 4: `Value: ` + truncate(raw, 30).
- Row 6: `Expected: owner/name`.

`buildRateLimitPage(resetHeader: string | null): RawPage`
- Row 2: `RATE LIMITED` in Alpha Red.
- Row 4: `GitHub allows 60 requests/hour`.
- Row 6: if `resetHeader` is not null, `Reset: ` + `formatResetTime(resetHeader)`; otherwise `Reset time unavailable`.

`formatResetTime(header: string): string` — parses the Unix timestamp seconds as `new Date(Number(header) * 1000)` and formats as `HH:MM:SS UTC`.

`buildFetchErrorPage(context: string, reason: string): RawPage`
- Row 2: `FETCH ERROR` in Alpha Red.
- Row 4: `Page: ` + truncate(context, 34).
- Row 6: truncate(reason, 40).

### 8.11 Loading placeholder — REQ-7

`buildLoadingPage(pageNum: number): RawPage`
- Row 0: `NNN  Loading...` (NNN = three-digit page number).
- Row 5: `Loading...`.
- Row 23: Fastext prompt.

---

## 9. Router and lazy fetch wiring (`router.ts`) — REQ-15, REQ-16

### 9.1 Page registration

`setupRouter(state: AppState, fetcher: ReturnType<typeof makeFetcher>): PageStore`

Registers all pages in the store. Pages with no data yet receive their loading placeholder. A page-change callback triggers lazy fetching.

Page registration map:

| Page number | Builder | Lazy fetch trigger |
|-------------|---------|-------------------|
| 100         | `buildIndexPage` | fetched on startup |
| 110         | `buildCommitSubpages` | first open |
| 120         | `buildPullsPage` | first open |
| 130         | `buildIssuesPage` | first open |
| 140         | `buildActionsPage` | first open |
| 150         | `buildLanguagesPage` | first open |
| 199         | `buildAboutPage` | no fetch needed |

### 9.2 Lazy fetch state machine

```
FetchState = 'idle' | 'in-flight' | 'done' | 'error'
```

Per-page fetch state is tracked in a `Map<number, FetchState>`. When the user navigates to a page:
1. If state is `'done'` or `'in-flight'`: no action.
2. If state is `'idle'`: set state to `'in-flight'`, call the appropriate `fetcher.*()` method.
3. On success: update `AppState`, rebuild the page in the store, set state to `'done'`, re-render.
4. On `RateLimitError`: set state to `'error'`, display `buildRateLimitPage`.
5. On other error: set state to `'error'`, display `buildFetchErrorPage`.

The in-flight `AbortController` is stored per-page. When the user navigates away from a page whose state is `'in-flight'`, the controller is aborted (REQ-7.4).

### 9.3 Carousel wiring

Page 110 has two subpages. `startAppCarousel` wraps `startCarousel` from `@skeletext/core` with a 6000 ms interval. The stop function is called whenever the user leaves page 110.

---

## 10. Entry point (`main.ts`) — REQ-1, REQ-17

```
function main() {
  const result = parseRepoParam(window.location.search);
  if (result === null) {
    // show invalid-repo page immediately
    startViewer(buildInvalidRepoPage(window.location.search));
    return;
  }
  const { owner, name } = result;
  const fetcher = makeFetcher(owner, name, 8000);
  const state: AppState = { owner, name, repo: null, commits: null, pulls: null, issues: null, runs: null, languages: null };

  fetcher.fetchRepo().then(repo => {
    state.repo = repo;
    store = setupRouter(state, fetcher);
    startViewer(store);
  }).catch(err => {
    handleStartupError(err);
  });
}
```

`handleStartupError` shows the rate-limit page or the generic error page depending on the error type.

---

## 11. Build configuration

Vite in library mode, `base: './'`, `@skeletext/core` bundled (not externalized). Output: `dist/index.html` + one JS bundle. No server-side files.

---

## 12. Key design decisions

**Lazy fetching with per-page abort controllers.** Fetching every endpoint on startup would consume the entire 60-request hourly budget within minutes for a multi-tab user. Lazy fetching spreads requests across user actions, and the 5-minute cache prevents redundant requests on revisits.

**Cache keyed by full URL.** Using the full request URL as the cache key means that switching `?repo=` parameters automatically misses the cache for the new repo without any cache invalidation logic.

**Null fields in `AppState`, not a discriminated union per page.** Each page builder receives `AppState` and reads the field it needs, returning a loading page if the field is null. This is simpler than a per-page state machine and mirrors the quake-desk pattern.

**ASCII substitutes for status indicators on page 140.** Teletext G0 is a 7-bit ASCII-compatible character set that does not include Unicode check marks (✓ ✗ …). The design uses `+`, `X`, and `~` which are unambiguous in context and within the 0x20–0x7F byte range.

**`drawBar` takes a mosaic colour byte, not an alpha colour byte.** This keeps the calling convention consistent with the quake-desk `bar.ts` approach and avoids a hidden colour translation at write time.

**Two commit subpages only.** The API returns up to 20 commits. Exactly two subpages of 10 are always produced; if fewer than 20 commits exist the remaining rows are blank. This avoids variable subpage counts that would complicate the carousel stop condition.
