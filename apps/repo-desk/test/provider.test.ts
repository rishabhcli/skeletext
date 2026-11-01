import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { interpretPage } from '@skeletext/core';
import { createProvider } from '../src/provider.js';
import type { Fetcher, Response2 } from '../src/github.js';

// fixtures: real GitHub API responses for rishabhcli/skeletext saved on 2026-10-31 (fields trimmed)
const snap = (n: string) => JSON.parse(readFileSync(new URL(`../scripts/snapshot-${n}.json`, import.meta.url), 'utf8'));
const signal = new AbortController().signal;
const text = (p: Uint8Array) => interpretPage(p).map((r) => r.map((c) => c.char).join('')).join('\n');

const routes: Record<string, unknown> = {
  '/repos/rishabhcli/skeletext': snap('repo'),
  '/repos/rishabhcli/skeletext/commits?per_page=20': snap('commits'),
  '/repos/rishabhcli/skeletext/pulls?state=open&per_page=20': snap('pulls'),
  '/repos/rishabhcli/skeletext/issues?state=open&per_page=30': snap('issues'),
  '/repos/rishabhcli/skeletext/actions/runs?per_page=10': snap('runs'),
  '/repos/rishabhcli/skeletext/languages': snap('languages'),
};
const make = () => {
  const fetcher = vi.fn<Fetcher>(async (url): Promise<Response2> => {
    const path = url.replace('https://api.github.com', '');
    return path in routes ? { ok: true, status: 200, headers: { get: () => null }, json: async () => routes[path] } : { ok: false, status: 404, headers: { get: () => null }, json: async () => ({}) };
  });
  const provider = createProvider({ owner: 'rishabhcli', name: 'skeletext' }, { fetcher, storage: null, now: () => Date.parse('2026-10-31T23:30:00Z') });
  return { fetcher, provider };
};

describe('provider (REQ-2.3)', () => {
  it('each page fetches only its own endpoint, once', async () => {
    const { fetcher, provider } = make();
    await provider(199, signal);
    expect(fetcher).not.toHaveBeenCalled();
    await provider(110, signal);
    await provider(110, signal);
    expect(fetcher.mock.calls.map((c) => c[0])).toEqual(['https://api.github.com/repos/rishabhcli/skeletext/commits?per_page=20']);
    await provider(150, signal);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('every page of the service can be built from real data', async () => {
    const { provider } = make();
    for (const n of [100, 110, 120, 130, 140, 150, 199]) {
      const p = await provider(n, signal);
      expect(p?.subpages.length).toBeGreaterThan(0);
      expect(p?.fastext).toMatchObject({ red: 100, green: 110, yellow: 140, cyan: 150 });
    }
    expect(text((await provider(100, signal))!.subpages[0]!)).toContain('rishabhcli/skeletext');
  });

  it('unknown page numbers are null and a missing repository is a readable error', async () => {
    const { provider } = make();
    expect(await provider(777, signal)).toBeNull();
    const missing = createProvider({ owner: 'nobody', name: 'nothing' }, { fetcher: async () => ({ ok: false, status: 404, headers: { get: () => null }, json: async () => ({}) }), storage: null, now: () => 0 });
    await expect(missing(100, signal)).rejects.toThrow('not found');
  });
});
