# How Kiro was used to build skeletext

This write-up says plainly which parts Kiro produced, which parts were written or corrected by hand, and where Kiro's output was wrong. The commit history of the repository follows the same order.

Short version: Kiro CLI wrote all four specs, the custom agent, the hooks, the MCP configuration, and the first versions of the grid, control code, mosaic, store, Fastext and codec modules with their tests. Spec-driven development, steering, hooks, a custom agent, MCP and property-based tests were all used. Review of the generated code found real defects, Kiro's attempt at the second app was stopped and replaced, and the free Kiro credits ran out in the middle of the build, so about half of the code was written by hand against the Kiro specs. All of this is described below.

## Setup and surfaces

| Surface | Used | Notes |
| --- | --- | --- |
| Kiro CLI 2.37.0 (macOS) | Yes | All generation was done with `kiro-cli chat --no-interactive`. Signed in with GitHub on the free plan, which includes 50 credits per month. |
| Kiro IDE | No | Not installed. The CLI covers specs, steering, hooks, agents and MCP. |
| Kiro Web | No | Needs a paid plan, the free plan shows an upgrade screen. |
| Kiro Crew | No | Not used. |

The CLI has two agent engines. The default one (V2) wrote the specs. The custom agent, the standalone hooks and the permission rules only load in the V3 engine (`kiro-cli chat --v3 --agent teletext-builder`), which was found by running the agent on the default engine and getting "Mode 'teletext-builder' not found".

Free credits ran out at 50 of 50 during the third implementation run. Kiro answered "You've reached your monthly usage limit". Two causes were visible afterwards: concurrent runs hit service throttling and the retry wrapper re-ran whole prompts, and the custom agent preloaded every spec file into every request. The agent's resources were trimmed afterwards. The plan resets at the start of the next month in UTC, which was 7 PM Central on 31 October, and the build continued after that. The Kiroween credit grant needs a government ID check, which was not done. About 10 of the new month's 50 credits went on the repo-desk run that was stopped (see Apps) and a few on the MCP verification run.

## Spec-driven development

Four specs live in `.kiro/specs/`, each with `requirements.md` (EARS statements, numbered criteria), `design.md` and `tasks.md`:

| Spec | Written by |
| --- | --- |
| `skeleton-core` | Kiro (model auto), then amended by Kiro to add the page builder, providers and system pages (REQ-10 to REQ-12) |
| `quake-desk` | Kiro (model auto) |
| `repo-desk` | Kiro (model auto) |
| `teletext-mcp` | Kiro (model auto), then one requirement corrected by hand |

The prompts that produced them are in `docs/kiro-prompts/`. Every acceptance criterion that states an invariant is tagged `[PBT]` and became a fast-check property.

What the spec step did well: it turned a one-page brief into numbered requirements with testable criteria (9 for the skeleton, 12 after the amendment), and it kept a consistent API vocabulary across design and tasks.

What it got wrong, found while implementing:

- The `teletext-mcp` spec said `initialize` returns the tool names as an array in `capabilities.tools`. Real MCP returns `{}` there and lists tools through `tools/list`. The spec was corrected (REQ-2.1) and the server follows the real protocol.
- The skeleton design described a run-length codec that used a control byte (0x01) as escape while pages contain control bytes, so the scheme was ambiguous. This was spotted by hand and the implementation prompt asked Kiro to test the round trip first and correct the scheme. Kiro changed it to the escape `0x80`, which cannot occur in 7-bit data, and updated section 9 of `design.md`. Its log does not show a failing run of the original scheme, so this is a defect found by review and fixed by Kiro, not one caught by a property test.
- `nextPage` in the first design navigated only among stored pages, while requirement 5.1.2 talks about the numbers 100 to 899. Number-level helpers were added.

## Steering

`.kiro/steering/` has five documents:

| File | Written by | Purpose |
| --- | --- | --- |
| `product.md`, `tech.md`, `structure.md` | Hand, before any Kiro run | Scope, language and test rules, folder layout. `inclusion: always` |
| `teletext-style.md` | Kiro | How app pages are laid out. `inclusion: fileMatch` for `apps/**/*.ts` |
| `typescript-gotchas.md` | Hand, after failed runs | Rules about `noUncheckedIndexedAccess`, `.js` import suffixes, and writing property tests from requirements instead of from the implementation |

The strategy that mattered most: a verified reference document, `docs/ets300706-level1-reference.md`, loaded by the agent as a resource. It was compiled from the ETSI ETS 300 706 PDF text and two Wikipedia pages, with a table of discrepancies. The first Kiro run, before that document existed, had no web access in non-interactive mode and announced that it would write from memory while claiming a cross-check it never made. That run was stopped and nothing it wrote was kept.

## Custom agent

`.kiro/agents/teletext-builder.json` and `.md` were written by Kiro from the agent documentation. The agent works one task of a `tasks.md` at a time, loads the steering files and the reference, has permission rules (writes only under `skeleton/`, `apps/`, `tools/`, `docs/`, `.kiro/specs/`; no `rm -rf`, `sudo`, `git push`, or curl piped to a shell), and registers the `teletext` MCP server. Two hand corrections: an `fs_read` allow rule (reads were being denied in non-interactive mode) and trimming the preloaded resources to save credits.

One more defect, found when a verification run reported that it had no MCP tools: the generated agent listed the tools `read`, `write` and `shell` but not `@teletext`, so the MCP server it registers was invisible to it. Adding `@teletext` to `tools` and an `mcp` allow rule fixed it.

Which Kiro app: the CLI, V3 engine. It ran the implementation of the skeleton phases, with models `qwen3-coder-next` (0.05x credits) and `claude-haiku-4.5` (0.4x) chosen to stretch the free credits.

## Hooks

Four standalone hooks in `.kiro/hooks/` were written by Kiro:

| Hook | Trigger | What it does |
| --- | --- | --- |
| `pbt-on-save` | `PostFileSave` for `skeleton/src/**/*.ts` | Runs the skeleton tests whenever the agent saves source |
| `protect-reference` | `PreToolUse` on write tools | Blocks writes to the verified reference document (exit code 2) |
| `tests-before-stop` | `Stop` | Runs all tests; on failure returns a continue decision so the agent keeps working |
| `spec-drift-check` | `PostTaskExecution` | Asks the agent to confirm the finished task still matches the requirement numbers it cites |

Hand corrections: the Stop trigger was written as `AgentStop` (the documented name is `Stop`); `protect-reference.sh` blocked any write whose content merely mentioned the file name and now inspects only path fields; `tests-before-stop.sh` got a three-failure limit and a check that tests exist.

The Stop hook fired for real during an early V3 test: it ran the suite, found no tests yet, and the agent was told to keep working. That is how the missing-tests case was discovered.

## MCP

`tools/teletext-mcp` is a stdio MCP server with four tools: `explain_code` (byte to name and timing), `render_page` (24-line drawing plus per-row display attributes through the skeleton interpreter), `validate_page` (double height on row 23, Start Box, over-long rows, bytes above 0x7F) and `encode_rows`. It is registered in `.kiro/settings/mcp.json`; `kiro-cli mcp list` shows the server. The server was written by hand against the Kiro spec (credits were out), has 18 tests, and a real `initialize`, `tools/list`, `tools/call` session was run against the built `dist/server.js`.

The workflow it exists for: judging a teletext page from its bytes is not possible by reading code, so quake-desk has a `scripts/dump-page.mjs` that builds a page from saved real data and prints its encoded form, and the agent passes that string to `render_page` and `validate_page`. A verification run with the fixed agent is saved as `docs/review-notes/kiro-mcp-verification-run.txt`: Kiro dumped pages 100, 101, 110, 120 and 199 of quake-desk, called `@teletext/render_page` and `@teletext/validate_page` on each, found no violations, and listed the rows that are cut with the `>` marker. In an earlier attempt at the same task, before the agent was fixed, Kiro could not see the MCP tools, worked around it by writing a test file that was not asked for, and that file was deleted. The verification run is the only place Kiro used the MCP server.

## Property-based testing

Tests use Vitest and fast-check. Some of what the properties covered:

- any page interprets to exactly 24 by 40 cells and the input is not modified
- a colour code never colours its own cell, for any code and any column
- a row looks identical alone or inside any page (attributes never leak between rows)
- every block mask 0 to 63 survives encode then interpret in mosaic mode
- the 0x00, 0x0E, 0x0F and 0x10 bytes give exactly the same page as 0x20
- the row below a double-height code only shows the cells above it
- the codec round-trips arbitrary pages, including pages made of long runs of control bytes, and decode only ever throws `CodecError`
- page navigation stays inside 100 to 899, is invertible, and visits all 800 pages
- digit entry never requests a page outside 100 to 899
- the viewer state machine always ends in exactly one of loading, page, not found or error
- the MCP server never crashes on arbitrary JSON, and `encode_rows` output decodes to the described page

What property tests did and did not catch: hand-written properties found real defects in the Kiro versions of the interpreter (9 of 22 new tests fail against it, see below). The Kiro-generated tests did not catch those same defects because they repeated the misreading of the Kiro-generated code. The new properties for the codec, the Fastext row and the page builder passed against the code as it stood after the hand fixes, so for those modules the properties pin behaviour rather than prove a past bug.

## Where Kiro's code was wrong

Kiro's first interpreter (`claude-haiku-4.5`, 61 tests passing) had these defects, found in review against the reference document:

1. "Bit 6" of the G1 mosaic set was read as `0x40`, so mosaics were detected in the wrong byte ranges. The requirement text itself listed the correct ranges.
2. Mosaic colour codes 0x11 to 0x17 mapped to colour 0 to 6 instead of 1 to 7.
3. The lower row of a double-height pair took its background from its own data instead of the cells above.
4. Release Mosaics, a set-after code, dropped the held mosaic on its own cell, and the held mosaic took the current separated form instead of the original.
5. Control cells and the no-effect codes were not equal to a space.

The interpreter and its tests were rewritten by hand. The new tests fail 9 of 22 against Kiro's version and pass against the rewrite. The original files are kept in `docs/review-notes/`. The lesson recorded in the steering file: write expected values from the requirement or the reference, never from the code under test.

Smaller things fixed by hand: TypeScript errors under `noUncheckedIndexedAccess` that the cheaper model could not resolve, mutation in `addPage`, Fastext labels that could inject control codes, and a codec decoder that accepted bytes above 0x7F.

## Who wrote what

| Part | Kiro | By hand |
| --- | --- | --- |
| Specs (4) | Wrote all, amended skeleton-core | Corrected `teletext-mcp` REQ-2.1 |
| Custom agent, hooks, MCP config, style steering | Wrote all | Fixed trigger name, hook scripts, agent permissions and resources |
| `grid`, `codes`, `mosaic`, `types` and tests | Wrote | None |
| `store`, `fastext`, `codec` and tests | Wrote first versions | TypeScript fixes, immutability, label sanitising, codec validation, number navigation helpers, extra property tests |
| `interpreter` and tests | Wrote first version | Rewrote both after review |
| `renderer`, `builder`, `system-pages`, `viewer` and tests | Not used | Wrote, because the free credits were out |
| `teletext-mcp` server and tests | Not used | Wrote against Kiro's spec |
| `quake-desk` app and tests | Spec only | Wrote against Kiro's spec |
| `repo-desk` app and tests | Spec, and a run that was stopped | Rewrote after the stopped run |
| MCP verification of app pages | Ran it, using the MCP tools | Fixed the agent so the tools were visible |
| Steering `product`, `tech`, `structure`, `typescript-gotchas`; verified ETS reference; README; CI workflow | Not used | Wrote |

## Vibe coding versus specs

The one place work was done without a spec step was the review of Kiro's interpreter, and it showed the cost of the other direction too: a precise spec (the requirement text had the correct byte ranges) did not stop an agent from implementing something different, and generated tests agreed with the generated code. What the spec gave was a sentence to check the code against. Without it the defects would have been matters of taste instead of failures.

## Apps

`apps/quake-desk` (live USGS earthquakes) was written by hand against the Kiro spec, with the structure the spec could not know about yet: a `PageProvider` per app and `mountTeletext` from the skeleton instead of the page store wiring the spec described. It has 28 tests, uses saved real USGS snapshots as fixtures, and is deployed at https://skeletext-quake-desk.vercel.app.

`apps/repo-desk` (public GitHub repository status) was started by Kiro (`qwen3-coder-next`, custom agent, V3 engine). The run was stopped after about 19 minutes and about 10 credits, with the helper modules and a few pages done. Reasons: the model waited long on every step, it added vite and a second copy of esbuild after being told not to add packages, and its page layouts overlapped because `PageBuilder.text` uses two cells for control codes which it did not count when it placed fields in fixed columns. The partial output is in the git history (commit "Kiro run E2") and the app was rewritten by hand with the same structure as quake-desk. 28 tests, saved real API responses as fixtures, deployed at https://skeletext-repo-desk.vercel.app.

Two lessons from the apps that are now tests: static pages must not contain a row that is cut by the `>` marker (the first copy of both apps had several, found by looking at frames of the demo footage), and field positions must be checked by property tests that read the rendered text rather than by trusting the layout arithmetic (the repo-desk tests check that a commit row still shows its full short hash, date and the start of the message).
