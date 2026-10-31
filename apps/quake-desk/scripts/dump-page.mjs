// Prints the encoded form of a page built from the saved real USGS snapshots, so a page can be
// inspected through the teletext MCP tools (render_page, validate_page) without any network.
// usage: node scripts/dump-page.mjs 101 [subpage]
import { build } from 'esbuild';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(mkdtempSync(join(tmpdir(), 'quake-dump-')), 'bundle.mjs');
await build({
  stdin: {
    contents: "export * from './src/provider.js'; export { parseFeed } from './src/feed.js'; export { encode } from '@skeletext/core';",
    resolveDir: join(here, '..'),
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: out,
  logLevel: 'error',
});
const { createProvider, parseFeed, encode } = await import(pathToFileURL(out).href);
const snap = (name) => parseFeed(JSON.parse(readFileSync(join(here, `snapshot-${name}.json`), 'utf8')));
const provider = createProvider({ loadFeed: async (n) => snap(n), now: () => Date.now() });
const page = await provider(Number(process.argv[2] ?? 100), new AbortController().signal);
if (!page) {
  console.error('no such page');
  process.exit(1);
}
process.stdout.write(encode(page.subpages[Number(process.argv[3] ?? 0)]) + '\n');
