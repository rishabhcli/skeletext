# repo-desk requirements

Source of truth for control code facts: `docs/ets300706-level1-reference.md`.
Skeleton public API: import only from `@skeletext/core`.

Requirements use EARS notation: WHEN <trigger> THE SYSTEM SHALL <response>.
Every requirement has an ID of the form REQ-N. Acceptance criteria have IDs of the form REQ-N.M.
Criteria tagged [PBT] must be covered by a property-based test using fast-check.

---

## REQ-1 Repository parameter

**WHEN** the app loads in the browser THE SYSTEM SHALL read the target repository from the `?repo=owner/name` query parameter. If the parameter is absent or empty the app SHALL default to `rishabhcli/skeletext`.

### Acceptance criteria

- **REQ-1.1** A URL with `?repo=torvalds/linux` causes the app to fetch data for `torvalds/linux`.
- **REQ-1.2** A URL with no `?repo` parameter causes the app to use `rishabhcli/skeletext`.
- **REQ-1.3** A URL with `?repo=` (empty value) causes the app to use `rishabhcli/skeletext`.
- **REQ-1.4** A parameter value that does not contain exactly one `/` separator causes the app to display an invalid-repo error page (REQ-3) immediately without fetching.
- **REQ-1.5** [PBT] For any string of the form `owner/name` where both parts are non-empty ASCII strings, `parseRepoParam` returns `{ owner, name }` without throwing.

---

## REQ-2 GitHub REST API access

**WHEN** data is needed for a page THE SYSTEM SHALL fetch it from the unauthenticated GitHub REST API v3 (`https://api.github.com/`) using the browser `fetch` API with a timeout of 8 seconds per request.

The following endpoints are used:

| Page | Endpoint |
|------|----------|
| 100 index | `GET /repos/{owner}/{name}` |
| 110 commits | `GET /repos/{owner}/{name}/commits?per_page=20` |
| 120 pull requests | `GET /repos/{owner}/{name}/pulls?state=open&per_page=20` |
| 130 issues | `GET /repos/{owner}/{name}/issues?state=open&per_page=20&labels=` |
| 140 Actions runs | `GET /repos/{owner}/{name}/actions/runs?per_page=20` |
| 150 languages | `GET /repos/{owner}/{name}/languages` |

### Acceptance criteria

- **REQ-2.1** Every fetch is aborted and treated as a failure if it has not completed within 8 seconds.
- **REQ-2.2** A response with HTTP status 403 or 429 is treated as a rate-limit error and shows the rate-limit error page (REQ-4) rather than the generic error page (REQ-5).
- **REQ-2.3** A response with any other HTTP status outside 200–299 shows the generic error page (REQ-5).
- **REQ-2.4** The `Accept: application/vnd.github+json` header is sent with every request.
- **REQ-2.5** [PBT] For any `owner` and `name` strings that are valid URL path segments, `buildApiUrl(owner, name, path)` returns a string that starts with `https://api.github.com/repos/` and contains no unencoded spaces.

---

## REQ-3 Invalid-repo error page

**WHEN** the `?repo` parameter is present but not in `owner/name` form THE SYSTEM SHALL display a full-screen error page that states the invalid value and explains the expected format, without making any network requests.

### Acceptance criteria

- **REQ-3.1** The error page occupies the full 24×40 grid.
- **REQ-3.2** The error page displays the literal invalid value (truncated to 30 characters to fit).
- **REQ-3.3** The page is built entirely from `@skeletext/core` primitives (`createPage`, `setCell`).

---

## REQ-4 Rate-limit error page

**WHEN** any GitHub API fetch returns HTTP 403 or 429 THE SYSTEM SHALL display a full-screen error page that states the rate-limit error and shows the reset time derived from the `X-RateLimit-Reset` response header.

### Acceptance criteria

- **REQ-4.1** If the `X-RateLimit-Reset` header is present its value (a Unix timestamp in seconds) is formatted as a UTC time string `HH:MM:SS UTC` and shown on the page.
- **REQ-4.2** If the `X-RateLimit-Reset` header is absent the page states `Reset time unavailable`.
- **REQ-4.3** The page is built entirely from `@skeletext/core` primitives.

---

## REQ-5 Generic fetch error page

**WHEN** any fetch fails for a reason other than a rate limit (network error, timeout, or non-2xx status excluding 403/429) THE SYSTEM SHALL display a full-screen error page that names the failing endpoint and the failure reason.

### Acceptance criteria

- **REQ-5.1** The error page states which page triggered the failure (e.g. `Page 110: commits`).
- **REQ-5.2** The error page states the failure reason (e.g. `timeout`, `HTTP 404`, `network error`) truncated to fit 40 columns.
- **REQ-5.3** Navigating away from the error page using digit keys is possible; the error page does not lock the router.

---

## REQ-6 localStorage cache

**WHEN** a successful API response is received THE SYSTEM SHALL store it in `localStorage` under a key derived from the request URL, together with the current timestamp.

**WHEN** a cached entry exists and its age is less than 5 minutes THE SYSTEM SHALL serve the cached response without making a network request.

**WHEN** a cached entry is 5 minutes old or older THE SYSTEM SHALL discard it and fetch fresh data.

### Acceptance criteria

- **REQ-6.1** The cache key is the full request URL string.
- **REQ-6.2** [PBT] For any cache entry object `{ data: unknown, timestamp: number }`, `isCacheValid(entry, now)` returns true if and only if `now - entry.timestamp < 300_000`.
- **REQ-6.3** A page that has been opened before renders from cache within a single event-loop tick when the cache is warm (no `fetch` call is made).
- **REQ-6.4** A `localStorage` write failure (e.g. quota exceeded) is caught and silently ignored; the app continues with the live data.
- **REQ-6.5** Cached entries from a different `owner/name` pair do not interfere with the current repo.

---

## REQ-7 Lazy page fetching

**WHEN** a page is opened for the first time THE SYSTEM SHALL initiate the fetch for that page's data if it is not already cached or in-flight.

**WHEN** a page is opened and its fetch is in-flight THE SYSTEM SHALL display a loading placeholder page until the fetch completes, then replace it.

Only page 100 (index) fetches on startup. All other pages fetch lazily when first opened.

### Acceptance criteria

- **REQ-7.1** On startup, only the `/repos/{owner}/{name}` endpoint is requested; no other endpoint is called until the user navigates to the relevant page.
- **REQ-7.2** A loading placeholder page is a valid 24×40 page showing `Loading...` on row 5 and the page number on row 0.
- **REQ-7.3** After a lazy fetch completes, the displayed page updates automatically without requiring user input.
- **REQ-7.4** If the user navigates away before a lazy fetch completes, the in-flight request is cancelled (the `AbortController` is aborted).

---

## REQ-8 Page 100 — index

**WHEN** page 100 is displayed THE SYSTEM SHALL render a repository summary page with the following layout:

- Row 0: standard header `100  REPO DESK           HH:MM:SS`.
- Rows 1–2: repository full name (`owner/name`) in double-height Alpha Cyan text.
- Row 4: description (truncated to 40 characters), in Alpha White.
- Row 6: `Stars:    ` followed by the star count, in Alpha Yellow.
- Row 7: `Forks:    ` followed by the fork count, in Alpha White.
- Row 8: `Issues:   ` followed by the open issues count, in Alpha White.
- Row 9: `Language: ` followed by the primary language, in Alpha Green; `Unknown` if null.
- Row 10: `License:  ` followed by the SPDX licence identifier; `None` if absent.
- Row 11: `Pushed:   ` followed by the age of the last push in human-readable form (e.g. `3 days ago`, `just now`).
- Row 23: Fastext prompt row (red 100, green 110, yellow 140, cyan 150).

### Acceptance criteria

- **REQ-8.1** Rows 1 and 2 use double-height: row 1 starts with 0x0D (Double Height) followed by 0x06 (Alpha Cyan); row 2 carries no visible glyphs (all cells are spaces at the page-builder level, per ETS 300 706 double-height lower-row rules).
- **REQ-8.2** All numeric counts are taken from the `stargazers_count`, `forks_count`, and `open_issues_count` fields of the `/repos` response; they are never invented.
- **REQ-8.3** The push age is computed as `now - pushed_at` and formatted by `formatAge`.
- **REQ-8.4** [PBT] For any non-negative integer `ageMs`, `formatAge(ageMs)` returns a non-empty string of at most 20 characters.

---

## REQ-9 Page 110 — latest commits

**WHEN** page 110 is displayed THE SYSTEM SHALL render a two-subpage list of the 20 most recent commits, 10 per subpage.

Each commit row shows: short SHA (7 characters), one space, date as `MM-DD`, one space, author login or name (truncated to 12 characters), one space, first line of commit message (truncated to fill the row to 40 columns).

### Acceptance criteria

- **REQ-9.1** Short SHA is the first 7 characters of `commit.sha`.
- **REQ-9.2** Date is formatted as `MM-DD` from the `commit.author.date` ISO string (UTC).
- **REQ-9.3** Author is taken from `commit.author.login` if present, otherwise from `commit.commit.author.name`; truncated to 12 characters.
- **REQ-9.4** The first line of the commit message is everything before the first `\n` in `commit.commit.message`.
- **REQ-9.5** Each subpage shows exactly 10 rows on rows 3–12; rows beyond the available commit count are left blank.
- **REQ-9.6** The subpage indicator on row 1 shows `1/2` or `2/2` according to the current subpage.
- **REQ-9.7** [PBT] For any commit message string, the bytes written to a single commit row never exceed 40.

---

## REQ-10 Page 120 — open pull requests

**WHEN** page 120 is displayed THE SYSTEM SHALL render a list of up to 20 open pull requests.

Each PR row shows: `#` followed by the PR number (right-aligned in 5 characters), one space, author login (truncated to 10 characters), one space, PR title (truncated to fill the row to 40 columns).

### Acceptance criteria

- **REQ-10.1** PR number, author login, and title are taken from the `number`, `user.login`, and `title` fields of the pulls response.
- **REQ-10.2** If there are no open PRs, row 5 reads `No open pull requests`.
- **REQ-10.3** [PBT] For any PR title string and any PR number in 1–99999, the bytes written for that row total exactly 40.

---

## REQ-11 Page 130 — open issues

**WHEN** page 130 is displayed THE SYSTEM SHALL render a list of up to 20 open issues, excluding pull requests (items that have a `pull_request` field).

Each issue row shows: `#` followed by the issue number (right-aligned in 5 characters), one space, author login (truncated to 10 characters), one space, issue title (truncated to fill the row to 40 columns).

### Acceptance criteria

- **REQ-11.1** Items from the `/issues` response that have a `pull_request` field are excluded.
- **REQ-11.2** If there are no open issues (after filtering), row 5 reads `No open issues`.
- **REQ-11.3** [PBT] For any issue title string and any issue number in 1–99999, the bytes written for that row total exactly 40.

---

## REQ-12 Page 140 — Actions runs

**WHEN** page 140 is displayed THE SYSTEM SHALL render a list of up to 18 recent workflow runs.

Each run row shows: a status indicator character, one space, workflow name (truncated to 20 characters), one space, the run's `head_branch` (truncated to 10 characters), two spaces, the run's `updated_at` as `MM-DD HH:MM`.

Status indicator and colour:
- `conclusion === 'success'`: `✓` in Alpha Green (0x02).
- `conclusion === 'failure'` or `'timed_out'`: `✗` in Alpha Red (0x01).
- `status === 'in_progress'` or `status === 'queued'`: `…` in Alpha Yellow (0x03).
- Any other value: `?` in Alpha White (0x07).

### Acceptance criteria

- **REQ-12.1** Each run row starts with the colour control byte for the status, followed by the indicator character.
- **REQ-12.2** A `conclusion === 'success'` run has a green-coloured row prefix.
- **REQ-12.3** A `conclusion === 'failure'` run has a red-coloured row prefix.
- **REQ-12.4** A `status === 'in_progress'` run has a yellow-coloured row prefix.
- **REQ-12.5** If there are no runs, row 5 reads `No workflow runs`.
- **REQ-12.6** [PBT] For any workflow name string and any branch name string, the bytes written for that row total exactly 40.

---

## REQ-13 Page 150 — language breakdown

**WHEN** page 150 is displayed THE SYSTEM SHALL render a bar chart of the repository's language breakdown by byte count, with one row per language, sorted by descending byte count.

Each language row shows: the language name (truncated to 12 characters), one space, a mosaic bar proportional to the language's share of total bytes (max 20 columns), one space, the percentage right-aligned in 5 characters (e.g. `45.2%`).

### Acceptance criteria

- **REQ-13.1** Byte counts come from the `/languages` response object; no values are invented.
- **REQ-13.2** The bar is drawn using `encodeBlockMask` from `@skeletext/core`; every mosaic byte written satisfies `byte & 0x20 === 0x20`.
- **REQ-13.3** The bar for the largest language fills exactly 20 mosaic columns; all other bars scale proportionally.
- **REQ-13.4** Percentage is computed as `(langBytes / totalBytes) * 100`, rounded to one decimal place.
- **REQ-13.5** If the repository has no detected languages, row 5 reads `No language data`.
- **REQ-13.6** [PBT] For any map of language names to positive byte counts (1–10 entries), the sum of all language percentages rounds to between 99.0 and 101.0.
- **REQ-13.7** [PBT] For any language byte-count map, every mosaic bar byte written to the page satisfies `byte & 0x20 === 0x20`.

---

## REQ-14 Page 199 — about

**WHEN** page 199 is displayed THE SYSTEM SHALL render an about page that includes: the app name `REPO DESK`, a note that data is fetched from the GitHub REST API, the current repository being shown, a note that no authentication key is required, and the cache duration (5 minutes).

### Acceptance criteria

- **REQ-14.1** The page is exactly 24 rows and each row is exactly 40 columns.
- **REQ-14.2** The current `owner/name` is shown on the page using live data, not a hard-coded string.

---

## REQ-15 Fastext navigation

**WHEN** the user presses a Fastext colour key THE SYSTEM SHALL navigate using `handleFastextKey` from `@skeletext/core` to the page linked on every page of the app:

- Red → page 100 (index).
- Green → page 110 (commits).
- Yellow → page 140 (Actions runs).
- Cyan → page 150 (languages).

### Acceptance criteria

- **REQ-15.1** Every registered page in the app carries the same four Fastext links.
- **REQ-15.2** The Fastext prompt row on every page is produced by `fillPromptRow` from `@skeletext/core`.
- **REQ-15.3** Pressing red from any page navigates to page 100.

---

## REQ-16 Carousel auto-advance

**WHEN** page 110 (commits) is displayed with two subpages THE SYSTEM SHALL advance the subpage automatically every 6 seconds using `tickCarousel` from `@skeletext/core`.

### Acceptance criteria

- **REQ-16.1** The carousel interval is 6000 ms.
- **REQ-16.2** Navigating away from page 110 stops the carousel timer.
- **REQ-16.3** [PBT] After any number of ticks, the subpage index for page 110 is always 0 or 1.

---

## REQ-17 Static deployment

**WHEN** the app is built THE SYSTEM SHALL produce a set of static files (HTML, CSS, JS) that can be hosted on any static file server with no server-side processing.

### Acceptance criteria

- **REQ-17.1** The build output contains no server-side script.
- **REQ-17.2** All GitHub data is fetched at runtime in the browser; no data is baked into the build.
- **REQ-17.3** The app imports `@skeletext/core` only; it does not import any other local package.
