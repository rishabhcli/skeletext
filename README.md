# skeletext

A small teletext page engine (the **skeleton**) and two apps built on it, made for the Kiroween 2026 hackathon in the Skeleton Crew category.

Teletext, known in the UK as Ceefax, sent numbered pages of 40 by 24 character cells with colour control codes and block mosaic graphics. The analogue services are gone (the BBC closed Ceefax in 2012). This project brings the page model back and uses it to show live public data.

| Folder | What it is |
| --- | --- |
| `skeleton/` | The shared engine, no runtime dependencies: cell grid, Level 1 control codes, display interpreter, SVG renderer, page builder, Fastext links, page codec, viewer |
| `apps/quake-desk/` | App 1: recent earthquakes from the USGS public feed, shown as teletext pages |
| `apps/repo-desk/` | App 2: the public status of a GitHub repository (commits, pull requests, issues, CI runs, languages) as teletext pages |
| `tools/teletext-mcp/` | A small MCP server that lets Kiro draw and validate teletext pages while it builds them |
| `.kiro/` | Kiro specs, steering documents, hooks, the custom agent and the MCP configuration used to build this project |
| `docs/` | The verified control code reference, notes on how Kiro was used, review notes |

## Try it

Live demos (static pages, they fetch live public data in your browser):

- Quake Desk: https://skeletext-quake-desk.vercel.app
- Repo Desk: https://skeletext-repo-desk.vercel.app (add `?repo=owner/name` for another public repository)

Keys: type three digits for a page (100 to 899), `r` `g` `y` `c` for the four Fastext colours, `i` for the index, left and right arrows for the previous and next page, `x` to reveal hidden text. On a phone use the coloured buttons and the page number field below the screen.

## Run it yourself

```bash
npm install
npm test                       # unit and property-based tests for every package
npm run build                  # bundles both apps into apps/*/dist
npx --yes serve apps/quake-desk/dist   # or any static file server
```

Node 20 or newer. The apps are static files, they fetch live data in the browser.

## How the skeleton is reused

Both apps import only `@skeletext/core`. An app provides one function, a `PageProvider` that returns the pages for a number, and mounts it with `mountTeletext`. Layout is done with `PageBuilder`, system pages (loading, not found, error) come from the skeleton.

```ts
import { mountTeletext, PageBuilder } from '@skeletext/core';

mountTeletext(document.getElementById('screen')!, async (n) => {
  if (n !== 100) return null;
  const page = new PageBuilder().header(100, 'HELLO').title('Hello').text(5, 0, 'A page of my own').build();
  return { subpages: [page], fastext: { red: 100, green: null, yellow: null, cyan: null, index: 100 } };
});
```

## Testing

Every invariant in the specs is covered by a fast-check property test, for example: any page is exactly 24 by 40 cells, a page survives encode and decode, colour codes never colour their own cell, attributes never leak between rows, page navigation stays inside 100 to 899. The control code facts come from ETSI ETS 300 706 and are recorded with sources and discrepancies in `docs/ets300706-level1-reference.md`.

## License

MIT, see `LICENSE`.
