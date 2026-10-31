// JSON-RPC 2.0 and MCP message handling, kept free of I/O so it can be tested directly.

import { HANDLERS, RpcError, TOOLS } from './tools.js';

type Id = string | number | null;

const reply = (id: Id, result: unknown) => JSON.stringify({ jsonrpc: '2.0', id, result });
const fail = (id: Id, code: number, message: string) => JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });

/**
 * Handle one line of input. Returns the response line, or null when no response is due
 * (notifications). Never throws.
 */
export function handleLine(line: string): string | null {
  let msg: unknown;
  try {
    msg = JSON.parse(line);
  } catch {
    return fail(null, -32700, 'Parse error');
  }
  try {
    if (typeof msg !== 'object' || msg === null || Array.isArray(msg)) return fail(null, -32600, 'Invalid Request');
    const m = msg as Record<string, unknown>;
    const hasId = 'id' in m;
    const id: Id = typeof m['id'] === 'string' || typeof m['id'] === 'number' ? (m['id'] as string | number) : null;
    if (m['jsonrpc'] !== '2.0' || typeof m['method'] !== 'string') return hasId ? fail(id, -32600, 'Invalid Request') : null;
    if (!hasId) return null; // notification, for example notifications/initialized

    const params = (typeof m['params'] === 'object' && m['params'] !== null ? m['params'] : {}) as Record<string, unknown>;
    switch (m['method']) {
      case 'initialize':
        return reply(id, {
          protocolVersion: typeof params['protocolVersion'] === 'string' ? params['protocolVersion'] : '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'teletext-mcp', version: '0.1.0' },
        });
      case 'ping':
        return reply(id, {});
      case 'tools/list':
        return reply(id, { tools: TOOLS });
      case 'tools/call': {
        const name = params['name'];
        const handler = typeof name === 'string' ? HANDLERS[name] : undefined;
        if (!handler) return fail(id, -32602, `Unknown tool: ${String(name)}`);
        const args = (typeof params['arguments'] === 'object' && params['arguments'] !== null ? params['arguments'] : {}) as Record<string, unknown>;
        const result = handler(args);
        return reply(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
      }
      default:
        return fail(id, -32601, `Method not found: ${m['method']}`);
    }
  } catch (e) {
    if (e instanceof RpcError) return fail(idOf(msg), e.code, e.message);
    return fail(idOf(msg), -32603, 'Internal error');
  }
}

function idOf(msg: unknown): Id {
  if (typeof msg === 'object' && msg !== null) {
    const id = (msg as Record<string, unknown>)['id'];
    if (typeof id === 'string' || typeof id === 'number') return id;
  }
  return null;
}
