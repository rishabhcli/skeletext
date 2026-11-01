import type { CommitItem, IssueItem, LanguageShare, PullItem, RepoInfo, RepoRef, RunItem } from './types.js';

export class GitHubError extends Error {
  constructor(
    message: string,
    public readonly kind: 'rate-limit' | 'not-found' | 'timeout' | 'network' | 'format',
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

export interface Response2 {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}
export type Fetcher = (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<Response2>;

export interface Storage2 {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const CACHE_MS = 5 * 60_000;
export const TIMEOUT_MS = 8000;
const API = 'https://api.github.com';

export interface Deps {
  fetcher: Fetcher;
  storage: Storage2 | null;
  now: () => number;
  timeoutMs?: number;
}

function resetTime(res: Response2): string {
  const raw = res.headers.get('x-ratelimit-reset');
  const seconds = raw === null ? NaN : Number(raw);
  if (!Number.isFinite(seconds)) return 'later';
  const d = new Date(seconds * 1000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
}

/** GET a JSON document from the GitHub API with a 5 minute localStorage cache and an 8 second timeout. */
export async function getJson(path: string, deps: Deps): Promise<unknown> {
  const key = `repo-desk:${path}`;
  const now = deps.now();
  try {
    const hit = deps.storage?.getItem(key);
    if (hit) {
      const parsed = JSON.parse(hit) as { at: number; data: unknown };
      if (typeof parsed.at === 'number' && now - parsed.at < CACHE_MS) return parsed.data;
    }
  } catch {
    // a broken cache entry is ignored
  }

  const controller = new AbortController();
  const timeoutMs = deps.timeoutMs ?? TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await deps.fetcher(`${API}${path}`, { signal: controller.signal, headers: { Accept: 'application/vnd.github+json' } });
    if (res.status === 403 || res.status === 429) {
      throw new GitHubError(`GitHub rate limit reached. Unauthenticated requests are limited per hour. The limit resets at ${resetTime(res)}.`, 'rate-limit');
    }
    if (res.status === 404) throw new GitHubError('That repository or page was not found. It may be private or misspelled.', 'not-found');
    if (!res.ok) throw new GitHubError(`GitHub answered with HTTP ${res.status}.`, 'network');
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      throw new GitHubError('GitHub sent a reply that is not JSON.', 'format');
    }
    try {
      deps.storage?.setItem(key, JSON.stringify({ at: now, data }));
    } catch {
      // quota or privacy mode: carry on without the cache
    }
    return data;
  } catch (e) {
    if (e instanceof GitHubError) throw e;
    if (controller.signal.aborted) throw new GitHubError(`GitHub did not answer within ${Math.round(timeoutMs / 1000)} seconds.`, 'timeout');
    throw new GitHubError(`GitHub could not be reached: ${e instanceof Error ? e.message : String(e)}`, 'network');
  } finally {
    clearTimeout(timer);
  }
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const int = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const time = (v: unknown): number | null => {
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : null;
};
const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function parseRepoInfo(raw: unknown): RepoInfo {
  const r = obj(raw);
  if (typeof r['full_name'] !== 'string') throw new GitHubError('GitHub sent a repository record without a name.', 'format');
  return {
    fullName: r['full_name'],
    description: str(r['description']),
    stars: int(r['stargazers_count']),
    forks: int(r['forks_count']),
    openIssuesAndPulls: int(r['open_issues_count']),
    language: typeof r['language'] === 'string' ? r['language'] : null,
    license: typeof obj(r['license'])['spdx_id'] === 'string' ? (obj(r['license'])['spdx_id'] as string) : null,
    pushedAt: time(r['pushed_at']),
    defaultBranch: str(r['default_branch'], 'main'),
    archived: r['archived'] === true,
  };
}

export function parseCommits(raw: unknown): CommitItem[] {
  return list(raw).flatMap((c) => {
    const o = obj(c);
    const commit = obj(o['commit']);
    const author = obj(commit['author']);
    const date = time(author['date']);
    if (typeof o['sha'] !== 'string' || date === null) return [];
    return [{ sha: o['sha'], message: str(commit['message']), author: str(obj(o['author'])['login'], str(author['name'], 'unknown')), date }];
  });
}

export function parsePulls(raw: unknown): PullItem[] {
  return list(raw).flatMap((p) => {
    const o = obj(p);
    const created = time(o['created_at']);
    if (typeof o['number'] !== 'number' || created === null) return [];
    return [{ number: o['number'], title: str(o['title']), author: str(obj(o['user'])['login'], 'unknown'), draft: o['draft'] === true, createdAt: created }];
  });
}

/** The issues endpoint also returns pull requests, those are filtered out. */
export function parseIssues(raw: unknown): IssueItem[] {
  return list(raw).flatMap((p) => {
    const o = obj(p);
    const created = time(o['created_at']);
    if ('pull_request' in o || typeof o['number'] !== 'number' || created === null) return [];
    return [{ number: o['number'], title: str(o['title']), author: str(obj(o['user'])['login'], 'unknown'), createdAt: created }];
  });
}

export function parseRuns(raw: unknown): RunItem[] {
  return list(obj(raw)['workflow_runs']).flatMap((r) => {
    const o = obj(r);
    const created = time(o['created_at']);
    if (created === null) return [];
    return [{ name: str(o['name'], 'workflow'), status: str(o['status']), conclusion: typeof o['conclusion'] === 'string' ? o['conclusion'] : null, branch: str(o['head_branch']), runNumber: int(o['run_number']), createdAt: created }];
  });
}

export function parseLanguages(raw: unknown): LanguageShare[] {
  return Object.entries(obj(raw))
    .flatMap(([name, bytes]) => (typeof bytes === 'number' && bytes > 0 ? [{ name, bytes }] : []))
    .sort((a, b) => b.bytes - a.bytes);
}

export const paths = (repo: RepoRef) => {
  const base = `/repos/${repo.owner}/${repo.name}`;
  return {
    repo: base,
    commits: `${base}/commits?per_page=20`,
    pulls: `${base}/pulls?state=open&per_page=20`,
    issues: `${base}/issues?state=open&per_page=30`,
    runs: `${base}/actions/runs?per_page=10`,
    languages: `${base}/languages`,
  };
};
