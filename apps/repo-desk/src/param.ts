import type { RepoRef } from './types.js';

export const DEFAULT_REPO: RepoRef = { owner: 'rishabhcli', name: 'skeletext' };

const PART = /^[A-Za-z0-9_.-]{1,100}$/;

/** Parse owner/name. Returns null for anything that is not a plain GitHub repository reference. */
export function parseRepo(value: string | null | undefined): RepoRef | null {
  if (value === null || value === undefined) return null;
  const parts = value.trim().split('/');
  if (parts.length !== 2) return null;
  const [owner, name] = parts as [string, string];
  if (!PART.test(owner) || !PART.test(name) || owner === '.' || owner === '..' || name === '.' || name === '..') return null;
  return { owner, name };
}

/** Choose the repository from a query string: missing means the default, present but invalid means null. */
export function repoFromSearch(search: string): RepoRef | null {
  const raw = new URLSearchParams(search).get('repo');
  return raw === null ? DEFAULT_REPO : parseRepo(raw);
}
