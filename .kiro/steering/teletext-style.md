---
inclusion: fileMatch
fileMatchPattern: "apps/**/*.ts"
---
# Teletext page style: app pages

These rules apply to every page rendered by an app. They follow Level 1 behaviour from `docs/ets300706-level1-reference.md`.

## Grid limits

- Each page is 40 columns wide and 24 rows tall (rows 0 to 23).
- Visible text must not exceed 38 columns per row. The remaining two columns hold control codes or are left blank so that colour changes do not visually crowd the edge.
- Row 23 is reserved as the Fastext prompt row. No data text may appear there.

## Row layout

- **Row 0** — page header. Contains the magazine-and-page number on the left, a short service name in the centre, and the clock on the right, all within 40 columns.
- **Row 1** — first half of the double-height title. Set the Double Height control code (0x0D) at the start of this row.
- **Row 2** — second half of the double-height title. This row is consumed by the double-height rendering of row 1 and must not carry independent text.
- **Rows 3 to 22** — body content.
- **Row 23** — Fastext prompt row only. Use the four standard key colours: red, green, yellow, cyan (control codes 0x01, 0x02, 0x03, 0x06) for linked page labels.

## Colour conventions

Use these control codes consistently across all apps so that viewers can read pages without learning app-specific conventions.

| Meaning | Foreground colour | Control code |
| --- | --- | --- |
| Page title (double-height) | Cyan | 0x06 |
| Section heading | Yellow | 0x03 |
| Numerical value or live data | White | 0x07 |
| Label or static text | Green | 0x02 |
| Warning or alert | Red | 0x01 |
| Supplementary or de-emphasised text | Magenta | 0x05 |

## Control code placement

- Insert colour and size control codes as spacing attributes. Each one occupies a cell and displays as a space, so account for it in the column count.
- The 38-column visible text limit already accounts for two control-code cells per row. If a row needs more than two control codes, reduce visible text further so the total cell width stays at 40.
- Never use Double Width (0x0E) or Double Size (0x0F): they are not interpreted at Level 1.
- Do not use Double Height (0x0D) on rows 22 or 23.
