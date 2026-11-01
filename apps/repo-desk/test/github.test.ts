import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { getJson, GitHubError, parseCommits, parseIssues, parseLanguages, parsePulls, parseRepoInfo, parseRuns, CACHE_MS, type Deps, type Fetcher, type Response2 } from '../src/github.js';
import { parseRepo, repoFromSearch, DEFAULT_REPO } from '../src/param.js';

// fixtures: real GitHub API responses for rishabhcli/skeletext saved on 2026-10-31 (fields trimmed)
const snap = (n: string) => JSON.parse(readFileSync(new URL(`../scripts/snapshot-${n}.json`, import.meta.url), 'utf8'));

const reply = (over: Partial<Response2> & { body?: unknown } = {}): Response2 => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  json: async () => over.body ?? {},
  ...over,
});
const memoryStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};
const deps = (fetcher: Fetcher, storage = memoryStorage(), clock = { t: 1_000_000 }): Deps & { clock: { t: number }; storage: ReturnType<typeof memoryStorage> } => ({ fetcher, storage, now: () => clock.t, clock });

describe('repo parameter (REQ-3)', () => {
  it('accepts owner/name and defaults when absent', () => {
    expect(parseRepo('rishabhcli/skeletext')).toEqual({ owner: 'rishabhcli', name: 'skeletext' });
    expect(repoFromSearch('')).toEqual(DEFAULT_REPO);
    expect(repoFromSearch('?repo=vercel/next.js')).toEqual({ owner: 'vercel', name: 'next.js' });
  });

  it('[PBT REQ-3.1] anything that is not exactly owner/name is rejected without a network request', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (s) => {
        const r = parseRepo(s);
        if (r) {
          expect(`${r.owner}/${r.name}`).toBe(s.trim());
          expect(/^[A-Za-z0-9_.-]+$/.test(r.owner + r.name)).toBe(true);
          expect(s.trim().split('/').length).toBe(2);
        }
      }),
      { numRuns: 400 },
    );
    for (const bad of ['', 'a', 'a/b/c', '../x', 'x/..', 'a/b?x=1', 'a b/c', 'a/<script>', '/b', 'a/']) expect(parseRepo(bad)).toBeNull();
    expect(repoFromSearch('?repo=nonsense')).toBeNull();
  });
});

describe('getJson (REQ-2, REQ-4)', () => {
  it('returns the body and caches it for five minutes', async () => {
    const fetcher = vi.fn<Fetcher>(async () => reply({ body: { hello: 1 } }));
    const d = deps(fetcher);
    expect(await getJson('/repos/a/b', d)).toEqual({ hello: 1 });
    d.clock.t += CACHE_MS - 1;
    expect(await getJson('/repos/a/b', d)).toEqual({ hello: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    d.clock.t += 2;
    await getJson('/repos/a/b', d);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('[PBT REQ-4.1] the cache never serves an entry older than five minutes', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 20 * 60_000 }), async (age) => {
        const fetcher = vi.fn<Fetcher>(async () => reply({ body: { n: 1 } }));
        const d = deps(fetcher);
        await getJson('/x', d);
        d.clock.t += age;
        await getJson('/x', d);
        expect(fetcher).toHaveBeenCalledTimes(age < CACHE_MS ? 1 : 2);
      }),
      { numRuns: 60 },
    );
  });

  it('a rate limit reply names the reset time from X-RateLimit-Reset', async () => {
    const reset = Date.UTC(2026, 9, 31, 20, 5) / 1000;
    const f: Fetcher = async () => reply({ ok: false, status: 403, headers: { get: (n) => (n.toLowerCase() === 'x-ratelimit-reset' ? String(reset) : null) } });
    await expect(getJson('/x', deps(f))).rejects.toMatchObject({ kind: 'rate-limit', message: expect.stringContaining('20:05 UTC') });
    const f429: Fetcher = async () => reply({ ok: false, status: 429 });
    await expect(getJson('/x', deps(f429))).rejects.toMatchObject({ kind: 'rate-limit', message: expect.stringContaining('later') });
  });

  it('404, other statuses, bad JSON, network failure and timeout each give a readable GitHubError', async () => {
    await expect(getJson('/x', deps(async () => reply({ ok: false, status: 404 })))).rejects.toMatchObject({ kind: 'not-found' });
    await expect(getJson('/x', deps(async () => reply({ ok: false, status: 500 })))).rejects.toMatchObject({ kind: 'network', message: expect.stringContaining('500') });
    await expect(getJson('/x', deps(async () => reply({ json: async () => { throw new SyntaxError('x'); } })))).rejects.toMatchObject({ kind: 'format' });
    await expect(getJson('/x', deps(async () => { throw new Error('offline'); }))).rejects.toMatchObject({ kind: 'network', message: expect.stringContaining('offline') });
    const never: Fetcher = (_u, init) => new Promise((_r, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))));
    await expect(getJson('/x', { ...deps(never), timeoutMs: 40 })).rejects.toMatchObject({ kind: 'timeout', message: expect.stringContaining('did not answer') });
  });

  it('a broken or full cache does not break loading', async () => {
    const storage = { getItem: () => '{not json', setItem: () => { throw new Error('quota'); } };
    const d: Deps = { fetcher: async () => reply({ body: { ok: true } }), storage, now: () => 5 };
    expect(await getJson('/x', d)).toEqual({ ok: true });
    expect(await getJson('/x', { ...d, storage: null })).toEqual({ ok: true });
  });

  it('errors are not cached', async () => {
    let n = 0;
    const f: Fetcher = async () => (++n === 1 ? reply({ ok: false, status: 500 }) : reply({ body: { fine: true } }));
    const d = deps(f);
    await expect(getJson('/x', d)).rejects.toBeInstanceOf(GitHubError);
    expect(await getJson('/x', d)).toEqual({ fine: true });
  });
});

describe('parsers (REQ-1)', () => {
  it('read real responses', () => {
    const info = parseRepoInfo(snap('repo'));
    expect(info.fullName).toBe('rishabhcli/skeletext');
    expect(info.license).toBe('MIT');
    expect(info.pushedAt).not.toBeNull();
    const commits = parseCommits(snap('commits'));
    expect(commits.length).toBe(snap('commits').length);
    expect(commits[0]!.sha).toHaveLength(40);
    expect(parseRuns(snap('runs')).length).toBe(snap('runs').workflow_runs.length);
    expect(parseLanguages(snap('languages'))[0]!.name).toBe('TypeScript');
    expect(parsePulls(snap('pulls'))).toEqual([]);
    expect(parseIssues(snap('issues'))).toEqual([]);
  });

  it('the issues endpoint filters out pull requests', () => {
    const raw = [{ number: 1, title: 'a', created_at: '2026-01-01T00:00:00Z', user: { login: 'u' } }, { number: 2, title: 'b', created_at: '2026-01-01T00:00:00Z', pull_request: {} }];
    expect(parseIssues(raw).map((i) => i.number)).toEqual([1]);
  });

  it('[PBT REQ-1.2] no parser throws on any JSON value', () => {
    fc.assert(
      fc.property(fc.anything(), (raw) => {
        for (const f of [parseCommits, parsePulls, parseIssues, parseRuns, parseLanguages]) expect(Array.isArray(f(raw))).toBe(true);
        try {
          parseRepoInfo(raw);
        } catch (e) {
          expect(e).toBeInstanceOf(GitHubError);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('languages are sorted by size and drop empty entries', () => {
    expect(parseLanguages({ A: 5, B: 50, C: 0, D: 'x' }).map((l) => l.name)).toEqual(['B', 'A']);
  });
});
