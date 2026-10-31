# skeletext

A small teletext page engine (the skeleton) and two apps built on top of it, made for the Kiroween 2026 hackathon (Skeleton Crew category).

Teletext (Ceefax in the UK) delivered numbered pages of 40 by 24 character cells with colour control codes and block mosaic graphics. The analogue services have been switched off, so this project revives the page model and uses it to show live public data.

Status: work in progress, started 2026-10-31 during the Kiroween submission period.

## Layout

| Folder | What it is |
| --- | --- |
| `skeleton/` | The shared engine: cell grid, control codes, page router, subpage carousel, renderer, encode and decode |
| `apps/quake-desk/` | App 1: recent earthquakes from the USGS public feed as teletext pages |
| `apps/repo-desk/` | App 2: public GitHub repository status as teletext pages |
| `tools/` | Development tooling, including an MCP server used while building with Kiro |
| `.kiro/` | Kiro specs, steering documents and hooks used to build this project |

## License

MIT, see `LICENSE`.
