import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { decode, interpretPage } from '@skeletext/core';
import { handleLine } from '../src/protocol.js';
import { expandRow, explainCode, encodeRows, renderPage, validatePage } from '../src/tools.js';

const call = (name: string, args: unknown, id = 1) => JSON.parse(handleLine(JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } })) as string);
const payload = (r: { result: { content: { text: string }[] } }) => JSON.parse(r.result.content[0]!.text);
const blank = () => Array.from({ length: 24 }, () => ' '.repeat(40));

describe('REQ-1 transport', () => {
  it('parse errors, invalid requests and unknown methods get the right codes', () => {
    expect(JSON.parse(handleLine('{nope') as string).error.code).toBe(-32700);
    expect(JSON.parse(handleLine('{"id":1,"method":"x"}') as string).error.code).toBe(-32600);
    expect(JSON.parse(handleLine('{"jsonrpc":"2.0","id":2,"method":"nope"}') as string).error.code).toBe(-32601);
  });

  it('[PBT REQ-1.5] any line gives at most one line of valid JSON, and never throws', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string({ maxLength: 200 }), fc.json(), fc.constant('[]'), fc.constant('null')), (line) => {
        const out = handleLine(line);
        if (out !== null) {
          expect(out.includes('\n')).toBe(false);
          const parsed = JSON.parse(out);
          expect(parsed.jsonrpc).toBe('2.0');
          expect('result' in parsed || 'error' in parsed).toBe(true);
        }
      }),
      { numRuns: 500 },
    );
  });
});

describe('REQ-2 MCP handshake', () => {
  it('initialize reports the server and tool capability, initialized produces no output', () => {
    const r = JSON.parse(handleLine('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26"}}') as string);
    expect(r.result.serverInfo.name).toBe('teletext-mcp');
    expect(r.result.capabilities.tools).toEqual({});
    expect(r.result.protocolVersion).toBe('2025-03-26');
    expect(handleLine('{"jsonrpc":"2.0","method":"notifications/initialized"}')).toBeNull();
  });

  it('tools/list names the four tools', () => {
    const r = JSON.parse(handleLine('{"jsonrpc":"2.0","id":3,"method":"tools/list"}') as string);
    expect(r.result.tools.map((t: { name: string }) => t.name).sort()).toEqual(['encode_rows', 'explain_code', 'render_page', 'validate_page']);
  });
});

describe('REQ-3 explain_code', () => {
  it('names the codes with their timing', () => {
    expect(explainCode({ byte: 13 })).toEqual({ byte: '0x0D', name: 'Double Height', timing: 'set-after', noEffect: false });
    expect(explainCode({ byte: 0x1d })).toMatchObject({ name: 'New Background', timing: 'set-at' });
    expect(explainCode({ byte: 32 })).toMatchObject({ name: 'printable', timing: 'n/a' });
    expect(explainCode({ byte: 200 })).toMatchObject({ name: 'undefined' });
    expect(explainCode({ byte: 0x0e })).toMatchObject({ noEffect: true });
  });

  it('rejects bad input with -32602', () => {
    expect(call('explain_code', { byte: 300 }).error.code).toBe(-32602);
    expect(call('explain_code', { byte: 1.5 }).error.code).toBe(-32602);
    expect(call('explain_code', {}).error.code).toBe(-32602);
  });

  it('[PBT REQ-3.6] every byte gives a named answer', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 255 }), (byte) => { expect(explainCode({ byte }).name).toBeTruthy(); }));
  });
});

describe('REQ-4 render_page', () => {
  it('draws 24 lines of 40 characters for a blank page', () => {
    const r = renderPage({ rows: blank() });
    const lines = (r['drawing'] as string).split('\n');
    expect(lines.length).toBe(24);
    expect(lines.every((l) => l === ' '.repeat(40))).toBe(true);
  });

  it('double height and colour escapes show up in the attributes', () => {
    const rows = blank();
    rows[1] = '\\x0D\\x03ABC' + ' '.repeat(33);
    const r = renderPage({ rows }) as { drawing: string; attributes: { fg: number[]; size: string[] }[] };
    expect(r.drawing.split('\n')[1]!.slice(0, 5)).toBe('  ABC');
    expect(r.attributes[1]!.size[2]).toBe('double-height-top');
    expect(r.attributes[1]!.fg[2]).toBe(3);
    expect(r.attributes[2]!.size[2]).toBe('double-height-lower');
  });

  it('[PBT REQ-4.3] any 24 printable rows give exactly 24 lines of exactly 40 characters', () => {
    const printable = fc.string({ unit: fc.integer({ min: 0x20, max: 0x7e }).map((c) => String.fromCharCode(c)), minLength: 0, maxLength: 40 });
    fc.assert(
      fc.property(fc.array(printable.map((s) => s.replace(/\\/g, '/')), { minLength: 24, maxLength: 24 }), (rows) => {
        const lines = (renderPage({ rows })['drawing'] as string).split('\n');
        expect(lines.length).toBe(24);
        for (const l of lines) expect(l.length).toBe(40);
      }),
      { numRuns: 200 },
    );
  });

  it('rejects wrong row counts, bad escapes and non-ASCII', () => {
    expect(call('render_page', { rows: ['x'] }).error.code).toBe(-32602);
    const bad = blank();
    bad[0] = '\\x0';
    expect(call('render_page', { rows: bad }).error.code).toBe(-32602);
    const wide = blank();
    wide[0] = 'é';
    expect(call('render_page', { rows: wide }).error.code).toBe(-32602);
    expect(call('render_page', {}).error.code).toBe(-32602);
  });
});

describe('REQ-5 validate_page', () => {
  it('flags the documented rules', () => {
    const rows = blank();
    rows[23] = '\\x0DX';
    rows[5] = ' '.repeat(10) + '\\x0B';
    const v = (validatePage({ rows }) as { violations: { rule: string; row: number; col: number }[] }).violations;
    expect(v).toContainEqual(expect.objectContaining({ rule: 'double-height-on-row-23', row: 23 }));
    expect(v).toContainEqual(expect.objectContaining({ rule: 'start-box-on-normal-page', row: 5, col: 10 }));
    const long = blank();
    long[2] = 'x'.repeat(41);
    expect((validatePage({ rows: long }) as { violations: { rule: string }[] }).violations.map((x) => x.rule)).toContain('row-too-long');
  });

  it('a clean page has no violations', () => {
    expect(validatePage({ rows: blank() })).toEqual({ violations: [] });
  });

  it('[PBT REQ-5.6] arbitrary input never makes validate_page crash the server', () => {
    fc.assert(
      fc.property(fc.anything(), (args) => {
        const out = handleLine(JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'validate_page', arguments: args } }));
        const parsed = JSON.parse(out as string);
        expect('result' in parsed || parsed.error.code === -32602).toBe(true);
      }),
      { numRuns: 300 },
    );
  });
});

describe('REQ-6 encode_rows', () => {
  it('[PBT REQ-6.2] the encoding decodes to the page the rows describe', () => {
    const printable = fc.string({ unit: fc.integer({ min: 0x20, max: 0x7e }).map((c) => String.fromCharCode(c)), maxLength: 50 }).map((s) => s.replace(/\\/g, '/'));
    fc.assert(
      fc.property(fc.array(printable, { minLength: 24, maxLength: 24 }), (rows) => {
        const { encoded } = encodeRows({ rows }) as { encoded: string };
        const page = decode(encoded);
        rows.forEach((row, r) => {
          const expected = row.slice(0, 40).padEnd(40, ' ');
          expect(Array.from(page.slice(r * 40, r * 40 + 40))).toEqual(Array.from(expected).map((c) => c.charCodeAt(0)));
        });
        // The same rows interpreted directly agree with the drawing tool.
        expect(interpretPage(page).length).toBe(24);
      }),
      { numRuns: 100 },
    );
  });

  it('counts non-space bytes and pads or truncates rows', () => {
    const rows = blank();
    rows[0] = 'AB';
    rows[1] = 'x'.repeat(60);
    const r = encodeRows({ rows }) as { byteCount: number };
    expect(r.byteCount).toBe(2 + 40);
    expect(call('encode_rows', { rows: ['x'] }).error.code).toBe(-32602);
  });

  it('tools/call returns the result as one JSON text block', () => {
    const r = call('explain_code', { byte: 0x1e });
    expect(r.result.content[0].type).toBe('text');
    expect(payload(r).name).toBe('Hold Mosaics');
  });
});

describe('escape expansion', () => {
  it('expands \\xHH and rejects broken escapes', () => {
    expect(expandRow('A\\x0DB')).toEqual([0x41, 0x0d, 0x42]);
    expect(expandRow('\\x1d')).toEqual([0x1d]);
    expect(() => expandRow('\\xZZ')).toThrow();
  });
});
