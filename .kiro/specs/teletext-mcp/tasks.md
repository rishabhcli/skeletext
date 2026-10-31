# teletext-mcp tasks

Implementation checklist for `tools/teletext-mcp/`. Each task is small and independently verifiable. Every implementation task is paired with a test task. Property-based tests use Vitest + fast-check and cover all [PBT]-tagged acceptance criteria.

Tasks are ordered so that the escape expander and tool handlers are implemented before the dispatcher, and the dispatcher before the stdio loop.

---

## Phase 0 — Project scaffold

- [ ] **T-0.1** Create `tools/teletext-mcp/package.json` with `name: "teletext-mcp"`, `type: "module"`, a `bin` entry pointing to `dist/main.js`, and devDependencies for `vitest` and `fast-check`. Add `@skeletext/core` as a runtime dependency (not a devDependency).
- [ ] **T-0.2** Create `tools/teletext-mcp/tsconfig.json` with `strict: true`, `target: "ES2022"`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `outDir: "dist"`.
- [ ] **T-0.3** Add a `vitest.config.ts` at `tools/teletext-mcp/` root covering `tools/teletext-mcp/test/**/*.test.ts`.

---

## Phase 1 — Shared types

- [ ] **T-1.1** Implement `tools/teletext-mcp/src/types.ts`: define and export `JsonRpcRequest`, `JsonRpcNotification`, `JsonRpcSuccess`, `JsonRpcError`, `ExplainResult`, `RenderResult`, `RowAttributes`, `ValidateResult`, `Violation`, `EncodeResult`, `InvalidParamsError`, and `EscapeError` as described in design §3. No logic; no tests needed for types alone.

---

## Phase 2 — Escape expansion (`escape.ts`) — REQ-4, REQ-5, REQ-6

- [ ] **T-2.1** Implement `expandEscapes` and `buildPage` in `tools/teletext-mcp/src/escape.ts` as described in design §6. `buildPage` calls `createPage` and `setCell` from `@skeletext/core`.
- [ ] **T-2.2** Write `tools/teletext-mcp/test/escape.test.ts`:
  - Unit: `expandEscapes('ABC')` returns `Uint8Array([65, 66, 67])`.
  - Unit: `expandEscapes('\\x0D')` returns `Uint8Array([13])`.
  - Unit: `expandEscapes('\\x41\\x42')` returns `Uint8Array([65, 66])` (hex for `A`, `B`).
  - Unit: `expandEscapes('\\x4')` (incomplete escape) throws `EscapeError`.
  - Unit: `expandEscapes('\\xGG')` (invalid hex) throws `EscapeError`.
  - Unit: `expandEscapes` on a string containing a character above 0x7F throws `EscapeError`.
  - Unit: `buildPage` with 24 strings of 40 spaces returns a 960-byte page of all 0x20.
  - Unit: `buildPage` with a row shorter than 40 characters pads the remainder with 0x20.
  - Unit: `buildPage` with a row longer than 40 characters truncates to 40.

---

## Phase 3 — Tool: `explain_code` (`tools/explain.ts`) — REQ-3

- [ ] **T-3.1** Implement `handleExplain` in `tools/teletext-mcp/src/tools/explain.ts` using `CONTROL_CODES` from `@skeletext/core`.
- [ ] **T-3.2** Write `tools/teletext-mcp/test/tools/explain.test.ts`:
  - Unit: `handleExplain({ byte: 13 })` returns `{ byte: "0x0D", name: "Double Height", timing: "set-after", noEffect: false }` (REQ-3.1).
  - Unit: `handleExplain({ byte: 25 })` returns `{ ..., timing: "set-at" }` (REQ-3.2).
  - Unit: `handleExplain({ byte: 32 })` returns `{ name: "printable", timing: "n/a", noEffect: false }` (REQ-3.3).
  - Unit: `handleExplain({ byte: 200 })` returns `{ name: "undefined", timing: "n/a", noEffect: false }` (REQ-3.4).
  - Unit: `handleExplain({ byte: 0 })` returns `{ name: "Alpha Black", noEffect: true }` (one of the four no-effect codes).
  - Unit: `handleExplain({ byte: -1 })` throws `InvalidParamsError` (REQ-3.5).
  - Unit: `handleExplain({ byte: 256 })` throws `InvalidParamsError`.
  - Unit: `handleExplain({ byte: 1.5 })` throws `InvalidParamsError` (non-integer).
  - **[PBT REQ-3.6]** `fc.integer({ min: 0, max: 255 })`: `handleExplain({ byte: n })` never throws and always returns an object with a non-empty `name` string.

---

## Phase 4 — Tool: `render_page` (`tools/render.ts`) — REQ-4

- [ ] **T-4.1** Implement `handleRender` in `tools/teletext-mcp/src/tools/render.ts` using `decode` and `interpretPage` from `@skeletext/core` and `buildPage` from `escape.ts`.
- [ ] **T-4.2** Write `tools/teletext-mcp/test/tools/render.test.ts`:
  - Unit: `handleRender({ rows: Array(24).fill(' '.repeat(40)) })` returns a `drawing` of 24 lines each being 40 spaces (REQ-4.1).
  - Unit: the `drawing` field always contains exactly 23 `\n` characters (24 lines joined by `\n`).
  - Unit: `handleRender({ rows: Array(23).fill('') })` throws `InvalidParamsError` (only 23 rows, REQ-4.5).
  - Unit: `handleRender({ rows: Array(24).fill('') })` with one entry containing `\\xFF` (byte 255) throws `InvalidParamsError` (REQ-4.7 — byte above 0x7F).
  - Unit: a row with `\\x0D\\x03ABC` in the `attributes` output has `size[1]` equal to `"double-height-top"` (REQ-4.4).
  - Unit: a mosaic byte in the page produces `'#'` at that position in the `drawing` line.
  - Unit: a control byte (e.g. 0x01) in the page produces `' '` at that position in the `drawing` line.
  - **[PBT REQ-4.2]** Generate a `RawPage` with `createPage()` from `@skeletext/core`, encode it with `encode`, pass as `encoded`: `drawing` has exactly 24 lines and each line is exactly 40 characters.
  - **[PBT REQ-4.3]** `fc.array(fc.string({ minLength: 40, maxLength: 40, unit: 'grapheme' }).filter(s => [...s].every(c => c.codePointAt(0)! <= 0x7E && c.codePointAt(0)! >= 0x20)), { minLength: 24, maxLength: 24 })`: `drawing` has exactly 24 lines each of exactly 40 visible characters.

---

## Phase 5 — Tool: `validate_page` (`tools/validate.ts`) — REQ-5

- [ ] **T-5.1** Implement `handleValidate` in `tools/teletext-mcp/src/tools/validate.ts` using `buildPage` and `expandEscapes` from `escape.ts`. All internal errors MUST be caught and returned as violations, not re-thrown.
- [ ] **T-5.2** Write `tools/teletext-mcp/test/tools/validate.test.ts`:
  - Unit: a page with 0x0D on row 23 returns a violation `{ rule: "double-height-on-row-23", row: 23 }` (REQ-5.1).
  - Unit: a page with 0x0B on row 5, col 10 returns a violation `{ rule: "start-box-on-normal-page", row: 5, col: 10 }` (REQ-5.2).
  - Unit: `handleValidate({ rows: [...24 rows where one is 41 chars long...] })` returns a `row-too-long` violation (REQ-5.3).
  - Unit: a valid page returns `{ violations: [] }` (REQ-5.5).
  - Unit: `handleValidate({ rows: Array(24).fill('') })` returns `{ violations: [] }` for all-space rows.
  - **[PBT REQ-5.6]** `fc.string()` as input for both `encoded` and `rows[*]` fields: `handleValidate` never throws and always returns an object with a `violations` array.

---

## Phase 6 — Tool: `encode_rows` (`tools/encode.ts`) — REQ-6

- [ ] **T-6.1** Implement `handleEncode` in `tools/teletext-mcp/src/tools/encode.ts` using `buildPage` from `escape.ts` and `encode`/`decode` from `@skeletext/core`.
- [ ] **T-6.2** Write `tools/teletext-mcp/test/tools/encode.test.ts`:
  - Unit: `handleEncode({ rows: Array(24).fill(' '.repeat(40)) })` returns `{ encoded: <string>, byteCount: 0 }`.
  - Unit: `decode(result.encoded)` for the above equals a 960-byte page of all 0x20 (REQ-6.1).
  - Unit: `handleEncode({ rows: Array(23).fill('') })` throws `InvalidParamsError` (REQ-6.4).
  - Unit: a row shorter than 40 characters: the encoded page has 0x20 at the padding positions (REQ-6.5).
  - Unit: a row longer than 40 characters: the encoded page has only the first 40 bytes (REQ-6.5).
  - **[PBT REQ-6.2]** `fc.array(fc.string({ unit: 'binary' }).filter(s => [...s].every(c => c.codePointAt(0)! >= 0x20 && c.codePointAt(0)! <= 0x7E)), { minLength: 24, maxLength: 24 })`: `decode(result.encoded)` reproduces a page byte-for-byte identical to what the tool computed before encoding.
  - **[PBT REQ-6.3]** `fc.array(fc.string(), { minLength: 24, maxLength: 24 })`: `handleEncode` returns a success result and never throws.

---

## Phase 7 — MCP handshake (`handshake.ts`) — REQ-2

- [ ] **T-7.1** Implement `handleInitialize` and `handleToolsList` in `tools/teletext-mcp/src/handshake.ts` as described in design §5.
- [ ] **T-7.2** Write `tools/teletext-mcp/test/handshake.test.ts`:
  - Unit: `handleInitialize` response has `result.serverInfo.name === 'teletext-mcp'` (REQ-2.2).
  - Unit: `handleToolsList` response lists exactly `['explain_code', 'render_page', 'validate_page', 'encode_rows']` as tool names (REQ-2.1).
  - Unit: each tool descriptor has `name`, `description`, and `inputSchema` fields.

---

## Phase 8 — Method dispatcher (`dispatch.ts`)

- [ ] **T-8.1** Implement `defaultDispatch` in `tools/teletext-mcp/src/dispatch.ts` routing `initialize`, `tools/list`, `tools/call`, and unknown methods as described in design §11.
- [ ] **T-8.2** Write `tools/teletext-mcp/test/dispatch.test.ts`:
  - Unit: dispatching `initialize` returns a success response with `result.serverInfo.name === 'teletext-mcp'`.
  - Unit: dispatching `tools/list` returns a success response listing the four tools.
  - Unit: dispatching `tools/call` with `name: 'explain_code'` and `arguments: { byte: 7 }` returns a success response.
  - Unit: dispatching `tools/call` with an unknown `name` returns a Method not found error (-32601).
  - Unit: dispatching `tools/call` with `name: 'explain_code'` and `arguments: { byte: -1 }` returns an Invalid params error (-32602).
  - Unit: dispatching an unknown method returns a Method not found error (-32601).

---

## Phase 9 — JSON-RPC 2.0 stdio loop (`rpc.ts`) — REQ-1

- [ ] **T-9.1** Implement `startServer` and `writeResponse` in `tools/teletext-mcp/src/rpc.ts` using `readline.createInterface` on `process.stdin`. Export `startServer` so tests can inject a mock dispatch and mock streams.
- [ ] **T-9.2** Write `tools/teletext-mcp/test/rpc.test.ts` using mock `Readable`/`Writable` streams (no child processes):
  - Unit: a well-formed JSON-RPC request produces one line of JSON output (REQ-1.1).
  - Unit: the output line is valid JSON and has `jsonrpc === "2.0"`.
  - Unit: a non-JSON line produces a Parse error response with `error.code === -32700` (REQ-1.2).
  - Unit: a JSON object missing `id` and `method` but valid JSON produces an Invalid Request error (-32600) (REQ-1.3).
  - Unit: a JSON object with `jsonrpc: "2.0"` but no `id` field (notification) produces no output line (REQ-2.3).
  - Unit: a JSON object for an unknown method produces a Method not found error (-32601) (REQ-1.4).
  - **[PBT REQ-1.5]** `fc.json()`: for any string that is valid JSON, the server produces exactly one output line that is valid JSON.

---

## Phase 10 — Entry point (`main.ts`)

- [ ] **T-10.1** Implement `tools/teletext-mcp/src/main.ts` as described in design §12: call `startServer(defaultDispatch)`. No tests needed for the entry point; integration is verified by running the compiled binary.

---

## Phase 11 — Integration

- [ ] **T-11.1** Run `vitest run` for `tools/teletext-mcp/` and confirm all tests pass with zero failures.
- [ ] **T-11.2** Run `tsc` and confirm zero TypeScript errors and a `dist/main.js` is produced.
- [ ] **T-11.3** Run `echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | node dist/main.js` and confirm the output is a valid JSON-RPC response with `result.serverInfo.name === "teletext-mcp"`.
- [ ] **T-11.4** Run a `tools/call` for `explain_code` with `{ "byte": 13 }` via stdin and confirm the response text contains `"Double Height"`.
