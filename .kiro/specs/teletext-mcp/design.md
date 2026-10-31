# teletext-mcp design

This document describes the module structure, data types, and algorithms for `tools/teletext-mcp/`. It is derived from `requirements.md` and constrained by the skeleton public API in `@skeletext/core`. No code is written here.

---

## 1. Transport choice: hand-written JSON-RPC 2.0 loop

The two options are:

**Option A: `@modelcontextprotocol/sdk`** — the official TypeScript MCP SDK. It handles the JSON-RPC framing, the `initialize`/`initialized` handshake, and tool dispatch. It is actively maintained by Anthropic. However, it introduces a non-trivial runtime dependency tree, and the full MCP protocol surface (roots, resources, prompts, sampling) is much larger than what this server needs.

**Option B: hand-written JSON-RPC 2.0 stdio loop** — reads lines from `process.stdin`, parses each as JSON, dispatches on `method`, writes a JSON line to `process.stdout`. The full server is fewer than 150 lines of transport code. The JSON-RPC 2.0 specification fits on a few pages.

**Decision: Option B.** The reasons are:

1. This server exposes exactly four tools and one lifecycle method (`initialize`). The MCP protocol surface used here is a strict subset of JSON-RPC 2.0 with a single handshake; there is no streaming, no resources, no prompts, and no sampling.
2. A hand-written loop has zero runtime dependencies beyond Node.js built-ins and `@skeletext/core`. This keeps the tool installable with a single `npm install` and nothing else.
3. The hand-written loop is fully unit-testable without mocking an SDK: tests pass JSON strings in and assert on JSON strings out. The SDK's transport abstractions would require additional mocking.
4. The risk of the SDK changing its API or becoming unmaintained is non-zero; the risk of `process.stdin`/`process.stdout` changing is zero.

If the protocol requirements grow (resources, streaming, roots), Option A should be reconsidered.

---

## 2. Package layout

```
tools/teletext-mcp/
  src/
    types.ts        — JSON-RPC 2.0 types and MCP tool result types
    rpc.ts          — JSON-RPC 2.0 stdio loop (REQ-1)
    handshake.ts    — initialize / initialized handler (REQ-2)
    escape.ts       — \xNN escape expansion for rows input (REQ-4, REQ-5, REQ-6)
    tools/
      explain.ts    — explain_code tool (REQ-3)
      render.ts     — render_page tool (REQ-4)
      validate.ts   — validate_page tool (REQ-5)
      encode.ts     — encode_rows tool (REQ-6)
    dispatch.ts     — method router: maps method names to handlers
    main.ts         — entry point: wire rpc.ts to dispatch.ts
  test/
    rpc.test.ts
    escape.test.ts
    tools/
      explain.test.ts
      render.test.ts
      validate.test.ts
      encode.test.ts
  package.json
  tsconfig.json
```

The server imports `@skeletext/core` as a runtime dependency. Vitest and fast-check are devDependencies only.

---

## 3. Shared types (`types.ts`)

### 3.1 JSON-RPC 2.0 types

```
JsonRpcRequest {
  jsonrpc: "2.0"
  id:      string | number
  method:  string
  params?: unknown
}

JsonRpcNotification {
  jsonrpc: "2.0"
  method:  string
  params?: unknown
  // no id field
}

JsonRpcSuccess<T> {
  jsonrpc: "2.0"
  id:      string | number
  result:  T
}

JsonRpcError {
  jsonrpc: "2.0"
  id:      string | number | null
  error: {
    code:    number
    message: string
  }
}
```

Standard JSON-RPC 2.0 error codes used:

| Code | Name |
|------|------|
| -32700 | Parse error |
| -32600 | Invalid Request |
| -32601 | Method not found |
| -32602 | Invalid params |
| -32603 | Internal error |

### 3.2 Tool result types

```
ExplainResult {
  byte:     string   // hex string, e.g. "0x0D"
  name:     string
  timing:   "set-at" | "set-after" | "n/a"
  noEffect: boolean
}

RenderResult {
  drawing:    string    // 24 lines joined by \n
  attributes: RowAttributes[]
}

RowAttributes {
  fg:    number[]    // 40 colour indices 0–7
  bg:    number[]
  flash: boolean[]
  size:  string[]    // 40 size strings
}

ValidateResult {
  violations: Violation[]
}

Violation {
  row:    number
  col:    number | null
  rule:   string
  detail: string
}

EncodeResult {
  encoded:   string
  byteCount: number
}
```

---

## 4. JSON-RPC 2.0 stdio loop (`rpc.ts`) — REQ-1

### 4.1 Input handling

The loop reads `process.stdin` line by line using Node.js `readline.createInterface`. For each line:

1. If the line is empty: skip.
2. Attempt `JSON.parse(line)`. On failure: write a Parse error response (-32700) with `id: null`.
3. Validate the parsed object as a JSON-RPC 2.0 message:
   - Must have `jsonrpc === "2.0"`.
   - If it has an `id` field: it is a request. Validate `method` is a string; if missing, write Invalid Request (-32600).
   - If it has no `id` field: it is a notification. Pass to the notification handler; write nothing.
4. Pass requests to `dispatch(request)` and write the returned response.

### 4.2 Output

`writeResponse(obj: JsonRpcSuccess<unknown> | JsonRpcError): void`

Serialises `obj` as JSON, appends `\n`, and writes to `process.stdout.write`. A single synchronous write per response guarantees atomicity on the line level.

### 4.3 Startup

`startServer(dispatch: Dispatcher): void`

Wires `readline` to `dispatch`. Exported for testing with a mock `dispatch`. The entry point calls `startServer(defaultDispatch)`.

---

## 5. MCP handshake (`handshake.ts`) — REQ-2

### 5.1 `handleInitialize(request: JsonRpcRequest): JsonRpcSuccess<InitializeResult>`

Returns:

```json
{
  "jsonrpc": "2.0",
  "id": <request.id>,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": {}
    },
    "serverInfo": {
      "name": "teletext-mcp",
      "version": "1.0.0"
    }
  }
}
```

After `initialize`, a `tools/list` request (if the client sends one) returns the four tool descriptors. Each descriptor has a `name`, `description`, and `inputSchema` (a JSON Schema object describing the tool's parameters).

### 5.2 `handleToolsList(): JsonRpcSuccess<ToolsListResult>`

Returns the four tool descriptors in the MCP `tools/list` response format:

- `explain_code`: input schema `{ type: "object", properties: { byte: { type: "integer", minimum: 0, maximum: 255 } }, required: ["byte"] }`.
- `render_page`: input schema `{ type: "object", oneOf: [{ required: ["encoded"] }, { required: ["rows"] }] }`.
- `validate_page`: same input schema as `render_page`.
- `encode_rows`: input schema `{ type: "object", properties: { rows: { type: "array", items: { type: "string" }, minItems: 24, maxItems: 24 } }, required: ["rows"] }`.

---

## 6. Escape expansion (`escape.ts`) — REQ-4, REQ-5, REQ-6

### 6.1 `expandEscapes(s: string): Uint8Array`

Scans the string left to right:

1. If the current position has `\x` followed by exactly two characters in `[0-9A-Fa-f]`: emit the byte value, advance 4 characters.
2. If the current position has `\x` but fewer than 2 hex characters follow: throw `EscapeError('incomplete escape at position N')`.
3. Otherwise: read the character's code point. If it is above 0x7F: throw `EscapeError('non-ASCII character at position N')`. Emit the code point as a byte, advance 1 character.

Returns a `Uint8Array` of the expanded bytes.

### 6.2 `buildPage(rows: string[]): RawPage`

1. Call `createPage()` from `@skeletext/core` (fills with 0x20).
2. For each of the 24 rows:
   - Expand escapes: `bytes = expandEscapes(rows[i])`.
   - Write bytes into the page using `setCell`, up to 40 bytes. Excess bytes are ignored (truncated). Rows shorter than 40 are left padded with 0x20 from `createPage`.
3. Return the `RawPage`.

---

## 7. Tool: `explain_code` (`tools/explain.ts`) — REQ-3

`handleExplain(params: unknown): ExplainResult`

1. Validate `params.byte` is an integer in 0–255. Throw `InvalidParamsError` otherwise.
2. If `byte` is in 0x00–0x1F: look up the entry in `CONTROL_CODES` from `@skeletext/core`. Return `{ byte: hex(byte), name: entry.name, timing: entry.timing, noEffect: entry.noEffect }`.
3. If `byte` is in 0x20–0x7F: return `{ byte: hex(byte), name: "printable", timing: "n/a", noEffect: false }`.
4. If `byte` is in 0x80–0xFF: return `{ byte: hex(byte), name: "undefined", timing: "n/a", noEffect: false }`.

`hex(n: number): string` — formats as `"0x"` + the two-digit uppercase hex value, e.g. `hex(13)` → `"0x0D"`.

---

## 8. Tool: `render_page` (`tools/render.ts`) — REQ-4

`handleRender(params: unknown): RenderResult`

1. Resolve the input to a `RawPage`:
   - If `params.encoded` is a string: call `decode(params.encoded)` from `@skeletext/core`. Throw `InvalidParamsError` on `CodecError`.
   - If `params.rows` is an array of 24 strings: call `buildPage(params.rows)`. Throw `InvalidParamsError` on `EscapeError`.
   - Otherwise: throw `InvalidParamsError`.
2. Call `interpretPage(page, false)` from `@skeletext/core` to get `cells: DisplayCell[][]`.
3. Build `drawing`: for each row r of 24, map each cell c of 40 to a single ASCII character:
   - If `cell.charMode === 'mosaic'` and `cell.mosaicMask > 0`: emit `'#'`.
   - Otherwise: emit `cell.char` if it is a printable ASCII character (0x20–0x7E), else emit `' '`.
   - Join the 40 characters into a string. Join all 24 row strings with `'\n'`.
4. Build `attributes`: for each row r, produce a `RowAttributes` object by mapping each cell to its `fg`, `bg`, `flash`, and `size` fields.

---

## 9. Tool: `validate_page` (`tools/validate.ts`) — REQ-5

`handleValidate(params: unknown): ValidateResult`

All errors in the input (bad escape, bad encoded string) are caught inside the function and returned as violations rather than thrown. This ensures the tool never produces a JSON-RPC error response for any input (REQ-5.6).

Algorithm:

1. Resolve input to either a `RawPage` (from `encoded`) or a per-row `Uint8Array[]` (from `rows`), wrapping all failures as violations of rule `"parse-error"` at row 0 if they occur.
2. If input was `rows`: for each row i, check `expandEscapes` result length > 40 → add `{ row: i, col: null, rule: "row-too-long", detail: "..." }`.
3. Iterate all 24 × 40 bytes:
   - Byte is 0x0D and row is 23 → add `double-height-on-row-23` violation.
   - Byte is 0x0B → add `start-box-on-normal-page` violation.
   - Byte is above 0x7F → add `byte-above-7f` violation.
4. Return `{ violations }`.

---

## 10. Tool: `encode_rows` (`tools/encode.ts`) — REQ-6

`handleEncode(params: unknown): EncodeResult`

1. Validate `params.rows` is an array of exactly 24 strings. Throw `InvalidParamsError` otherwise.
2. Call `buildPage(params.rows)` to produce a `RawPage`.
3. Count `byteCount`: iterate all 960 bytes and count those not equal to 0x20.
4. Call `encode(page)` from `@skeletext/core` to produce the codec string.
5. Return `{ encoded, byteCount }`.

---

## 11. Method dispatcher (`dispatch.ts`)

```
Dispatcher = (request: JsonRpcRequest) => JsonRpcSuccess<unknown> | JsonRpcError
```

`defaultDispatch(request: JsonRpcRequest): JsonRpcSuccess<unknown> | JsonRpcError`

Routes on `request.method`:

| Method | Handler |
|--------|---------|
| `initialize` | `handleInitialize` |
| `tools/list` | `handleToolsList` |
| `tools/call` | dispatch on `params.name` to the four tool handlers |
| anything else | return Method not found error (-32601) |

For `tools/call`:
1. Extract `params.name` and `params.arguments`. If either is missing: return Invalid params (-32602).
2. Dispatch to the matching tool handler. Catch `InvalidParamsError` → return -32602. Catch any other error → return Internal error (-32603).
3. Wrap the tool result in the MCP `tools/call` response format: `{ content: [{ type: "text", text: JSON.stringify(toolResult, null, 2) }] }`.

---

## 12. Entry point (`main.ts`)

```typescript
import { startServer } from './rpc.js';
import { defaultDispatch } from './dispatch.js';

startServer(defaultDispatch);
```

The server runs until stdin is closed. No cleanup is needed.

---

## 13. Build and run

`package.json` scripts:
- `build`: `tsc` — compiles to `dist/`.
- `start`: `node dist/main.js` — runs the compiled server.
- `test`: `vitest run`.

The `bin` field in `package.json` points to `dist/main.js` so the server can be invoked directly after `npm install -g` or via `npx`.

`tsconfig.json`: `strict: true`, `target: "ES2022"`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `outDir: "dist"`.

---

## 14. Key design decisions

**No SDK dependency.** Justified in §1. The hand-written loop is 100–150 lines and fully testable. The four tool handlers are pure functions that take `unknown` and return a typed result or throw; the transport layer is the only impure layer.

**`validate_page` never throws.** The tool's contract (REQ-5.6) is that it always returns a success response even for garbage input. All parsing errors inside the tool are caught and represented as violations. This makes it safe for Kiro to call `validate_page` on partial or malformed page content during development.

**`render_page` uses `'#'` for all mosaic cells.** A true mosaic rendering in ASCII requires Unicode box-drawing characters, which are multi-byte in UTF-8 and outside the teletext G0 character set. Using `'#'` for any non-zero mosaic mask is unambiguous and stays within printable ASCII, keeping the drawing field trivially parseable.

**Tool results are serialised to a `text` content block.** The MCP `tools/call` response wraps the result JSON string in `{ content: [{ type: "text", text: "..." }] }`. This is the standard MCP text content format and is what Kiro's tool-use pipeline expects.

**Tests call tool handler functions directly.** The unit tests import `handleExplain`, `handleRender`, etc. and call them with plain objects. The JSON-RPC framing and dispatch are tested separately in `rpc.test.ts` by passing raw strings to a test harness. This separation keeps tests fast and avoids spawning child processes.
