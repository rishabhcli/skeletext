import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseRepoParam, buildApiUrl } from '../src/param.js';

describe('parseRepoParam', () => {
  it('returns { owner, name } for valid owner/name format', () => {
    expect(parseRepoParam('?repo=torvalds/linux')).toEqual({ owner: 'torvalds', name: 'linux' });
  });

  it('returns default for empty search string', () => {
    expect(parseRepoParam('')).toEqual({ owner: 'rishabhcli', name: 'skeletext' });
  });

  it('returns default for empty repo value', () => {
    expect(parseRepoParam('?repo=')).toEqual({ owner: 'rishabhcli', name: 'skeletext' });
  });

  it('returns null for parameter without slash', () => {
    expect(parseRepoParam('?repo=noslash')).toBeNull();
  });

  it('returns null for parameter with multiple slashes', () => {
    expect(parseRepoParam('?repo=a/b/c')).toBeNull();
  });

  it('returns null for leading slash', () => {
    expect(parseRepoParam('?repo=/repo')).toBeNull();
  });

  it('returns null for trailing slash', () => {
    expect(parseRepoParam('?repo=owner/')).toBeNull();
  });
});

describe('buildApiUrl', () => {
  it('builds correct URL for commits endpoint', () => {
    expect(buildApiUrl('torvalds', 'linux', '/commits')).toBe('https://api.github.com/repos/torvalds/linux/commits');
  });

  it('builds correct URL for languages endpoint', () => {
    expect(buildApiUrl('owner', 'name', '/languages')).toBe('https://api.github.com/repos/owner/name/languages');
  });

  it('URL-encodes owner and name', () => {
    expect(buildApiUrl('org/name', 'repo with spaces', '/path')).toBe('https://api.github.com/repos/org%2Fname/repo%20with%20spaces/path');
  });
});

describe('parseRepoParam property tests', () => {
  it('REQ-1.5 returns { owner, name } for valid owner/name strings', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter(s => !s.includes('/') && !s.includes(' ') && !s.includes('&') && !s.includes('=') && !s.includes('+') && !s.includes('%')),
        fc.string({ minLength: 1 }).filter(s => !s.includes('/') && !s.includes(' ') && !s.includes('&') && !s.includes('=') && !s.includes('+') && !s.includes('%')),
        (owner, name) => {
          const param = `?repo=${owner}/${name}`;
          const result = parseRepoParam(param);
          expect(result).toEqual({ owner, name });
        }
      )
    );
  });
});

describe('buildApiUrl property tests', () => {
  it('REQ-2.5 starts with correct prefix and has no unencoded spaces', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter(s => !s.includes(' ')),
        fc.string({ minLength: 1 }).filter(s => !s.includes(' ')),
        (owner, name) => {
          const url = buildApiUrl(owner, name, '/commits');
          expect(url.startsWith('https://api.github.com/repos/')).toBe(true);
          expect(url.includes(' ')).toBe(false);
        }
      )
    );
  });
});
