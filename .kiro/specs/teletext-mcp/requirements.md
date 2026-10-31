# teletext-mcp requirements

Source of truth for control code facts: `docs/ets300706-level1-reference.md`.
Skeleton public API: import only from `@skeletext/core`.

Requirements use EARS notation: WHEN <trigger> THE SYSTEM SHALL <response>.
Every requirement has an ID of the form REQ-N. Acceptance criteria have IDs of the form REQ-N.M.
Criteria tagged [PBT] must be covered by a property-based test using fast-check.

---

## REQ-1 Transport

**WHEN** the MCP server starts THE SYSTEM SHALL communicate over stdio using the JSON-RPC 2.0 wire format, reading newline-delimited JSON from stdin and writing newline-delimited JSON to stdout.

Every message written to stdout SHALL be a single line terminated by exactly one `\n`. Every message written to stdout SHALL be a valid JSON-RPC 2.0 response or notification object.

### Acceptance criteria

- **REQ-1.1** A well-formed JSON-RPC 2.0 request on stdin produces a well-formed JSON-RPC 2.0 response on stdout within the same event-loop drain.
- **REQ-1.2** A request that is not valid JSON produces a JSON-RPC 2.0 error response with code -32700 (Parse error).
- **REQ-1.3** A request with a valid JSON body but missing `jsonrpc`, `method`, or `id` fields produces an error response with code -32600 (Invalid Request).
- **REQ-1.4** A request for an unknown method produces an error response with code -32601 (Method not found).
- **REQ-1.5** [PBT] For any string that is valid JSON, the server produces exactly one line of output that is itself valid JSON.

---

## REQ-2 MCP handshake

**WHEN** a client sends an `initialize` request THE SYSTEM SHALL respond with a capabilities object listing the four tools (`explain_code`, `render_page`, `validate_page`, `encode_rows`) and the server name `teletext-mcp`.

**WHEN** a client sends an `initialized` notification THE SYSTEM SHALL accept it silently (no response, since it is a notification not a request).

### Acceptance criteria

- **REQ-2.1** The `initialize` response `result.capabilities.tools` is an array containing exactly the names `explain_code`, `render_page`, `validate_page`, and `encode_rows`.
- **REQ-2.2** The `initialize` response `result.serverInfo.name` is `teletext-mcp`.
- **REQ-2.3** The `initialized` notification (a JSON-RPC message with no `id` field) produces no output line.

---

## REQ-3 Tool: `explain_code`

**WHEN** the client calls `explain_code` with a `byte` argument (a number 0–255) THE SYSTEM SHALL return a JSON object with the following fields:

- `byte`: the input byte value as a hexadecimal string, e.g. `"0x0D"`.
- `name`: the canonical ETS 300 706 name from the skeleton control code table, or `"printable"` for bytes 0x20–0x7F, or `"undefined"` for bytes 0x80–0xFF.
- `timing`: `"set-at"`, `"set-after"`, or `"n/a"` (for printable and undefined bytes).
- `noEffect`: `true` for the four no-effect codes (0x00, 0x0E, 0x0F, 0x10), `false` otherwise.

### Acceptance criteria

- **REQ-3.1** `explain_code({ byte: 13 })` (0x0D = Double Height) returns `{ byte: "0x0D", name: "Double Height", timing: "set-after", noEffect: false }`.
- **REQ-3.2** `explain_code({ byte: 25 })` (0x19 = Contiguous Mosaic Graphics) returns `{ ..., timing: "set-at" }`.
- **REQ-3.3** `explain_code({ byte: 32 })` (0x20 = space) returns `{ name: "printable", timing: "n/a", noEffect: false }`.
- **REQ-3.4** `explain_code({ byte: 200 })` (0xC8, above 0x7F) returns `{ name: "undefined", timing: "n/a", noEffect: false }`.
- **REQ-3.5** A call with a `byte` argument that is not an integer in 0–255 returns a JSON-RPC error with code -32602 (Invalid params).
- **REQ-3.6** [PBT] For any integer in 0–255, `explain_code` returns a result object (never an error) and the `name` field is a non-empty string.

---

## REQ-4 Tool: `render_page`

**WHEN** the client calls `render_page` with either:
- an `encoded` string (a codec string as produced by `encode` from `@skeletext/core`), or
- a `rows` array of exactly 24 strings using the escape syntax described below,

THE SYSTEM SHALL run the skeleton interpreter over the page and return a JSON object with:
- `drawing`: a string containing exactly 24 lines separated by `\n`, each line being exactly 40 printable ASCII characters representing the visible content of that row (control bytes shown as spaces, mosaic blocks shown as `#`).
- `attributes`: an array of 24 objects, one per row, each with fields `fg` (array of 40 colour index integers 0–7), `bg` (same), `flash` (array of 40 booleans), `size` (array of 40 strings, each `"normal"`, `"double-height-top"`, or `"double-height-lower"`).

**Escape syntax for `rows` strings:** a `\x` followed by two uppercase hexadecimal digits encodes the byte with that value. All other characters are taken as their ASCII byte values. Characters with ASCII values above 0x7F are an error.

### Acceptance criteria

- **REQ-4.1** A 24-element `rows` array of 40-space strings produces a `drawing` of 24 lines each containing exactly 40 space characters.
- **REQ-4.2** [PBT] For any valid encoded page string (produced by `encode` from `@skeletext/core`), the `drawing` field contains exactly 24 lines and each line is exactly 40 characters.
- **REQ-4.3** [PBT] For any 24-element `rows` array of strings where each string is 40 characters of printable ASCII, the `drawing` field contains exactly 24 lines of exactly 40 visible characters.
- **REQ-4.4** A `rows` entry containing `\x0D` followed by `\x03ABC` produces the correct double-height and colour attributes in the `attributes` output.
- **REQ-4.5** A call with a `rows` array of fewer or more than 24 strings returns a JSON-RPC error with code -32602 (Invalid params).
- **REQ-4.6** A call with a `rows` string entry containing `\x` followed by fewer than 2 hex digits returns a JSON-RPC error with code -32602.
- **REQ-4.7** A call with a `rows` string entry containing a character with code point above 0x7F returns a JSON-RPC error with code -32602.

---

## REQ-5 Tool: `validate_page`

**WHEN** the client calls `validate_page` with either an `encoded` string or a `rows` array (same format as REQ-4) THE SYSTEM SHALL inspect the page bytes and return a JSON object with a `violations` array. Each violation is an object `{ row: number, col: number | null, rule: string, detail: string }`.

The following rules SHALL be checked:

| Rule name | Condition |
|-----------|-----------|
| `double-height-on-row-23` | A Double Height (0x0D) byte appears on row 23. |
| `start-box-on-normal-page` | A Start Box (0x0B) byte appears anywhere on the page. |
| `row-too-long` | A `rows`-input string, after escape expansion, produces more than 40 bytes. |
| `byte-above-7f` | A byte with value above 0x7F appears in the page. |

### Acceptance criteria

- **REQ-5.1** A page with 0x0D on row 23 returns a violation with `rule: "double-height-on-row-23"` and `row: 23`.
- **REQ-5.2** A page with 0x0B on row 5, col 10 returns a violation with `rule: "start-box-on-normal-page"`, `row: 5`, `col: 10`.
- **REQ-5.3** A `rows` input where one string expands to 41 bytes returns a violation with `rule: "row-too-long"`.
- **REQ-5.4** An `encoded` input decoded to a page containing a byte above 0x7F returns a violation with `rule: "byte-above-7f"` (this should not occur for pages produced by the skeleton, but the validator checks regardless).
- **REQ-5.5** A valid, rule-following page returns `{ violations: [] }`.
- **REQ-5.6** [PBT] For any string input (even entirely arbitrary bytes), `validate_page` never throws and always returns a JSON-RPC success response with a `violations` array (which may be empty or non-empty).

---

## REQ-6 Tool: `encode_rows`

**WHEN** the client calls `encode_rows` with a `rows` array of exactly 24 strings (same escape syntax as REQ-4) THE SYSTEM SHALL expand the escape sequences, build a `RawPage` from the resulting bytes (padding each row to 40 bytes with 0x20 if shorter, truncating to 40 if longer), encode it with `encode` from `@skeletext/core`, and return a JSON object with:

- `encoded`: the compact codec string.
- `byteCount`: the total number of non-space (non-0x20) bytes in the page before encoding.

### Acceptance criteria

- **REQ-6.1** `encode_rows` with 24 strings each of length 40 containing only spaces returns an `encoded` string that `decode` from `@skeletext/core` reproduces the original page bytes.
- **REQ-6.2** [PBT] For any 24-element array of strings (using only printable ASCII, no escape sequences), `encode_rows` returns an `encoded` value that `decode(encoded)` produces a 960-byte page byte-for-byte identical to what `encode_rows` computed before encoding.
- **REQ-6.3** [PBT] For any 24-element array of strings, `encode_rows` returns a success response and never throws.
- **REQ-6.4** A call with a `rows` array of fewer or more than 24 strings returns a JSON-RPC error with code -32602 (Invalid params).
- **REQ-6.5** A `rows` string shorter than 40 characters is padded to 40 with 0x20; a string longer than 40 is truncated to 40.

---

## REQ-7 Skeleton reuse

**WHEN** implementing any tool THE SYSTEM SHALL use `@skeletext/core` for all page creation, interpretation, and codec operations. The MCP server SHALL NOT re-implement cell model, interpreter, or codec logic.

### Acceptance criteria

- **REQ-7.1** `render_page` calls `interpretPage` from `@skeletext/core` to produce display cells.
- **REQ-7.2** `encode_rows` calls `encode` from `@skeletext/core` to produce the codec string.
- **REQ-7.3** `explain_code` reads from `CONTROL_CODES` exported by `@skeletext/core`.
- **REQ-7.4** The package lists `@skeletext/core` as a dependency, not a devDependency.
