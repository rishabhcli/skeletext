# quake-desk requirements

Source of truth for control code facts: `docs/ets300706-level1-reference.md`.
Skeleton public API: import only from `@skeletext/core`.

Requirements use EARS notation: WHEN <trigger> THE SYSTEM SHALL <response>.
Every requirement has an ID of the form REQ-N. Acceptance criteria have IDs of the form REQ-N.M.
Criteria tagged [PBT] must be covered by a property-based test using fast-check.

---

## REQ-1 Data feeds

**WHEN** the app initialises THE SYSTEM SHALL fetch two USGS GeoJSON feeds concurrently using the browser `fetch` API with a timeout of 8 seconds each:

- `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson` — earthquakes magnitude 4.5 and above in the past day.
- `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson` — significant earthquakes in the past week.

Each GeoJSON feature has the following properties used by the app: `mag` (number), `place` (string), `time` (number, milliseconds since epoch), `url` (string), `felt` (number or null), `alert` (string or null), `tsunami` (0 or 1), `sig` (number), and `geometry.coordinates` as `[longitude, latitude, depth_km]`.

### Acceptance criteria

- **REQ-1.1** Both feeds are fetched on startup before any data page is rendered.
- **REQ-1.2** Each fetch is aborted and treated as a failure if it has not completed within 8 seconds.
- **REQ-1.3** [PBT] For any array of GeoJSON feature objects, the app's feature parser produces one structured record per feature and never throws.
- **REQ-1.4** The app never invents earthquake data; all displayed values come directly from the parsed feed response.

---

## REQ-2 Error page

**WHEN** any fetch fails (network error, timeout, or HTTP status outside 200–299) THE SYSTEM SHALL display a full-screen error page that states which feed failed and what the failure was, using white text on a black background.

### Acceptance criteria

- **REQ-2.1** The error page occupies the full 24×40 grid.
- **REQ-2.2** The error page names the failing feed URL (truncated to fit within 40 columns if necessary).
- **REQ-2.3** The error page is generated entirely from `@skeletext/core` page primitives (`createPage`, `setCell`).
- **REQ-2.4** Navigating away from the error page (e.g. pressing a digit key) is possible; the error page does not lock the router.

---

## REQ-3 Not-found page

**WHEN** the router is directed to a page number that has not been registered THE SYSTEM SHALL display a not-found page that shows the requested page number and invites the user to press a digit key.

### Acceptance criteria

- **REQ-3.1** The not-found page is registered as a fallback so that any unregistered number in 100–899 shows it.
- **REQ-3.2** The not-found page states the requested page number.

---

## REQ-4 Page 100 — index

**WHEN** page 100 is displayed THE SYSTEM SHALL render an index page with the following layout:

- Row 0: standard header row with page number `100` and a clock.
- Rows 1–2: the title `QUAKE DESK` in double-height Alpha Yellow text.
- Row 4: the feed generation time formatted as `Data: YYYY-MM-DD HH:MM UTC`.
- Rows 6–12: a summary list of available pages (page number, tab, short description) in white text.
- Row 23: Fastext prompt row (red 100, green 101, yellow 120, cyan 199).

### Acceptance criteria

- **REQ-4.1** The double-height title spans rows 1 and 2; row 2 carries no visible glyphs of its own (it is the lower half of row 1 per ETS 300 706 double-height rules).
- **REQ-4.2** The feed generation time is taken from the `generated` field of the GeoJSON metadata object; it is never hard-coded.
- **REQ-4.3** Page 100 is always accessible regardless of whether data has loaded (if data has not loaded, rows 6–12 read `Loading…`).

---

## REQ-5 Page 101 — magnitude 4.5+ list

**WHEN** page 101 is displayed THE SYSTEM SHALL render a paginated list of all earthquakes with magnitude ≥ 4.5 from the day feed, sorted by descending magnitude, with 10 events per subpage.

Each list row shows: magnitude (3 characters, coloured per REQ-10), two spaces, place name (truncated to 25 characters), two spaces, time as `HH:MM`.

### Acceptance criteria

- **REQ-5.1** Events are sorted by descending magnitude before pagination.
- **REQ-5.2** Each subpage shows at most 10 events on rows 3–12.
- **REQ-5.3** The subpage counter is shown on row 2 in the format `Page N of M`.
- **REQ-5.4** Subpages rotate automatically via the `tickCarousel` function from `@skeletext/core` at a 6-second interval.
- **REQ-5.5** [PBT] For any list of 0 to 200 events, the number of subpages equals `Math.ceil(events.length / 10)` (with a minimum of 1 if the list is empty, showing a `No events` message).
- **REQ-5.6** Place names longer than 25 characters are truncated with no ellipsis; the 40-column constraint is never exceeded.

---

## REQ-6 Page 102 — significant earthquakes this week

**WHEN** page 102 is displayed THE SYSTEM SHALL render the significant-week feed in the same list format as REQ-5 with the same per-row layout and the same carousel behaviour.

### Acceptance criteria

- **REQ-6.1** Data is taken from the significant-week feed, not the day feed.
- **REQ-6.2** Events are sorted by descending magnitude.
- **REQ-6.3** An empty significant-week feed shows a single subpage with the message `No significant events this week`.

---

## REQ-7 Pages 110–119 — detail pages

**WHEN** any of pages 110 to 119 is displayed THE SYSTEM SHALL render a detail view for the corresponding earthquake from the ten strongest events of the day feed (page 110 = rank 1 strongest, page 119 = rank 10 strongest).

Each detail page contains:

- Row 0: header with page number and clock.
- Row 1: place name (truncated to 40 characters), in white.
- Row 2: blank.
- Row 3: `Magnitude:` followed by the magnitude value, coloured per REQ-10.
- Row 4: `Depth:    ` followed by depth in km formatted as `NNN km`.
- Row 5: `Lat/Lon:  ` followed by coordinates formatted as `±NN.NNN / ±NNN.NNN`.
- Row 6: `Time:     ` followed by UTC datetime formatted as `YYYY-MM-DD HH:MM:SS`.
- Row 7: `Felt:     ` followed by the felt-reports count, or `—` if null.
- Row 8: `Tsunami:  ` followed by `YES` (Alpha Red) if tsunami=1, `no` (Alpha White) if tsunami=0.
- Row 9: `Alert:    ` followed by the alert string (green, yellow, or red depending on value) or `none`.
- Row 10: `USGS ID:  ` followed by the event id extracted from the `url` property.
- Row 11: blank.
- Rows 12–13: a magnitude bar drawn with mosaic blocks (see REQ-9).
- Row 23: Fastext prompt (red 100, green 101, yellow 120, cyan 199).

### Acceptance criteria

- **REQ-7.1** Pages 110–119 are registered only for the ten strongest day-feed events. If fewer than ten events are available, the remaining pages (e.g. 119 when there are only 7 events) show a not-found page.
- **REQ-7.2** The USGS event id is the final path segment of the `url` field (the part after the last `/`).
- **REQ-7.3** Coordinates are formatted to three decimal places for latitude and longitude.
- **REQ-7.4** All text fits within 40 columns; no row exceeds 40 cells.

---

## REQ-8 Page 120 — magnitude histogram

**WHEN** page 120 is displayed THE SYSTEM SHALL render a bar chart of earthquake counts from the day feed, grouped into half-magnitude bins starting at 4.0 and ending at the highest bin that contains at least one event.

Each bin is one row. The row shows: the bin label (e.g. `4.5–5.0`) left-aligned in 8 characters, then a mosaic bar drawn with filled blocks proportional to the count, then the count right-aligned in 4 characters.

### Acceptance criteria

- **REQ-8.1** Bins are half-magnitude wide: [4.0, 4.5), [4.5, 5.0), [5.0, 5.5), etc.
- **REQ-8.2** The bar for each bin is drawn using G1 mosaic bytes from `@skeletext/core` (`encodeBlockMask`) and scales so the widest bar fills 28 columns.
- **REQ-8.3** [PBT] For any non-empty list of events with magnitudes ≥ 4.0, every bar width is in the range 0 to 28 columns and every bin label is exactly 8 characters wide.
- **REQ-8.4** Empty bins within the range are shown with a zero-width bar.
- **REQ-8.5** The page title `MAGNITUDE HISTOGRAM` appears on row 1.

---

## REQ-9 Magnitude bar (detail pages)

**WHEN** a detail page renders its magnitude bar THE SYSTEM SHALL draw a horizontal bar on rows 12–13 using G1 mosaic blocks in the magnitude colour (REQ-10), where the bar width represents the magnitude on a scale of 0 to 10 mapped to 0 to 40 columns.

### Acceptance criteria

- **REQ-9.1** The bar is drawn using `encodeBlockMask` from `@skeletext/core`.
- **REQ-9.2** [PBT] For any magnitude value m in [0, 10], the bar occupies exactly `Math.round(m / 10 * 40)` columns and every mosaic byte in the bar is a valid G1 mosaic byte (has bit 5 set: `byte & 0x20 === 0x20`).
- **REQ-9.3** The bar colour follows REQ-10 (below 5 → white, 5 to below 6 → yellow, 6 and above → red).

---

## REQ-10 Magnitude colour rule

**WHEN** any magnitude value is rendered THE SYSTEM SHALL apply the following colour control byte before the magnitude digits:

- Magnitude below 5.0: Alpha White (0x07).
- Magnitude ≥ 5.0 and below 6.0: Alpha Yellow (0x03).
- Magnitude ≥ 6.0: Alpha Red (0x01).

### Acceptance criteria

- **REQ-10.1** [PBT] For any magnitude value in [0, 10], `magnitudeColour(m)` returns one of 0x07, 0x03, or 0x01 and the boundaries are exactly at 5.0 and 6.0 (inclusive on the upper side).
- **REQ-10.2** The colour function is a pure function with no side effects, usable by all page builders.

---

## REQ-11 Page 199 — about

**WHEN** page 199 is displayed THE SYSTEM SHALL render an about page that includes:

- The data source name `USGS Earthquake Hazards Program`.
- The URL of each feed, truncated to fit 40 columns.
- The feed generation time for each feed.
- A note that the data is public domain and no key is required.

### Acceptance criteria

- **REQ-11.1** All strings on the about page are literal or derived from parsed feed metadata; none are invented.
- **REQ-11.2** The page is no more than 24 rows and each row no more than 40 columns.

---

## REQ-12 Fastext navigation

**WHEN** the user presses a Fastext colour key THE SYSTEM SHALL navigate using `handleFastextKey` from `@skeletext/core` to the page linked on every page of the app:

- Red → page 100 (index).
- Green → page 101 (day list).
- Yellow → page 120 (histogram).
- Cyan → page 199 (about).

### Acceptance criteria

- **REQ-12.1** Every registered page in the app has the same four Fastext links.
- **REQ-12.2** The Fastext prompt row on every page is produced by `fillPromptRow` from `@skeletext/core`.
- **REQ-12.3** Pressing red from any page navigates to page 100.

---

## REQ-13 Carousel auto-advance

**WHEN** a page with multiple subpages is displayed THE SYSTEM SHALL advance the subpage automatically every 6 seconds using `tickCarousel` from `@skeletext/core`.

### Acceptance criteria

- **REQ-13.1** The carousel interval is 6000 ms.
- **REQ-13.2** Navigating away from a multi-subpage page does not leave a stale carousel timer running.
- **REQ-13.3** [PBT] After any number of ticks, the subpage index is always in the valid range for the current page.

---

## REQ-14 Static deployment

**WHEN** the app is built THE SYSTEM SHALL produce a set of static files (HTML, CSS, JS) that can be hosted on any static file server with no server-side processing.

### Acceptance criteria

- **REQ-14.1** The build output contains no server-side script.
- **REQ-14.2** The app fetches earthquake data from the browser at runtime; no data is baked into the build.
- **REQ-14.3** The app imports `@skeletext/core` only; it does not import any other local package.
