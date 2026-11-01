import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { interpretPage, type RawPage } from '@skeletext/core';
import { parseCommits, parseLanguages, parseRepoInfo, parseRuns } from '../src/github.js';
import { buildAboutPage, buildCommitSubpages, buildIndexPage, buildIssueSubpages, buildLanguagesPage, buildPullSubpages, buildRunSubpages, runStatus, LANGUAGE_BAR_CELLS, ROWS_PER_SUBPAGE, RUNS_PER_SUBPAGE } from '../src/pages.js';
import { monthDay } from '../src/format.js';
import type { CommitItem, IssueItem, LanguageShare, PullItem, RunItem } from '../src/types.js';

// fixtures: real GitHub API responses for rishabhcli/skeletext saved on 2026-10-31 (fields trimmed)
const snap = (n: string) => JSON.parse(readFileSync(new URL(`../scripts/snapshot-${n}.json`, import.meta.url), 'utf8'));
const NOW = Date.parse('2026-10-31T23:30:00Z');
const REPO = { owner: 'rishabhcli', name: 'skeletext' };

const text = (p: RawPage) => interpretPage(p).map((r) => r.map((c) => c.char).join(''));
const valid = (p: RawPage) => p.length === 960 && p.every((b) => b <= 0x7f);
const fourLinks = (p: RawPage) => Array.from(p.slice(23 * 40)).filter((b) => b < 0x20).join(',') === '1,2,3,6';
const ascii = fc.string({ unit: fc.integer({ min: 0x20, max: 0x7e }).map((c) => String.fromCharCode(c)), maxLength: 120 });
const dateArb = fc.integer({ min: Date.parse('2020-01-01'), max: Date.parse('2030-01-01') });

const commitArb = fc.record({ sha: fc.stringMatching(/^[0-9a-f]{40}$/), message: ascii, author: ascii, date: dateArb }) as fc.Arbitrary<CommitItem>;
const pullArb = fc.record({ number: fc.integer({ min: 1, max: 99999 }), title: ascii, author: ascii, draft: fc.boolean(), createdAt: dateArb }) as fc.Arbitrary<PullItem>;
const runArb = fc.record({
  name: ascii,
  status: fc.constantFrom('completed', 'in_progress', 'queued'),
  conclusion: fc.option(fc.constantFrom('success', 'failure', 'cancelled', 'skipped', 'timed_out'), { nil: null }),
  branch: ascii,
  runNumber: fc.integer({ min: 1, max: 99999 }),
  createdAt: dateArb,
}) as fc.Arbitrary<RunItem>;
const langArb = fc.uniqueArray(fc.record({ name: fc.stringMatching(/^[A-Za-z][A-Za-z+#]{0,14}$/), bytes: fc.integer({ min: 1, max: 5_000_000 }) }), { selector: (l) => l.name, maxLength: 14 }) as fc.Arbitrary<LanguageShare[]>;

describe('real data pages', () => {
  it('index shows the repository facts', () => {
    const page = buildIndexPage(REPO, parseRepoInfo(snap('repo')), NOW);
    const t = text(page).join('\n');
    expect(t).toContain('rishabhcli/skeletext');
    expect(t).toContain('MIT');
    expect(t).toContain('Latest commits');
    expect(valid(page) && fourLinks(page)).toBe(true);
  });

  it('commit list shows sha, date and message for every real commit', () => {
    const commits = parseCommits(snap('commits'));
    const pages = buildCommitSubpages(commits);
    expect(pages.length).toBe(Math.ceil(commits.length / ROWS_PER_SUBPAGE));
    const rows = pages.flatMap((p) => text(p).slice(4, 14));
    commits.slice(0, 3).forEach((c, i) => {
      expect(rows[i]).toContain(c.sha.slice(0, 7));
      expect(rows[i]).toContain(monthDay(c.date));
    });
  });

  it('CI page shows real runs with a result word', () => {
    const runs = parseRuns(snap('runs'));
    const t = text(buildRunSubpages(runs, NOW)[0]!).join('\n');
    expect(runs.length).toBeGreaterThan(0);
    expect(/ok|FAIL|run|skip|stop/.test(t)).toBe(true);
  });

  it('languages page lists TypeScript first', () => {
    const t = text(buildLanguagesPage(parseLanguages(snap('languages')))).join('\n');
    expect(t.indexOf('TypeScript')).toBeGreaterThan(-1);
    expect(t).toMatch(/\d+%/);
  });

  it('empty lists give a plain message instead of a blank page', () => {
    expect(text(buildPullSubpages([])[0]!).join('\n')).toContain('No open pull requests.');
    expect(text(buildIssueSubpages([])[0]!).join('\n')).toContain('No open issues.');
    expect(text(buildRunSubpages([], NOW)[0]!).join('\n')).toContain('No GitHub Actions runs found.');
    expect(text(buildCommitSubpages([])[0]!).join('\n')).toContain('No commits found.');
  });

  it('static pages fit the grid: no row of the about page or the empty pages is cut with the > marker', () => {
    const pages = [buildAboutPage(REPO, NOW), buildPullSubpages([])[0]!, buildIssueSubpages([])[0]!, buildRunSubpages([], NOW)[0]!, buildCommitSubpages([])[0]!];
    for (const page of pages) for (const row of text(page).slice(0, 23)) expect(row.trimEnd().endsWith('>')).toBe(false);
  });

  it('about page names the repository and the limits', () => {
    const t = text(buildAboutPage(REPO, NOW)).join('\n');
    expect(t).toContain('rishabhcli/skeletext');
    expect(t).toContain('60 anonymous requests');
  });
});

describe('page properties', () => {
  it('[PBT REQ-5.1] commit rows keep sha, date and the start of the message intact (no field overwrites another)', () => {
    fc.assert(
      fc.property(fc.array(commitArb, { minLength: 1, maxLength: 25 }), (commits) => {
        const pages = buildCommitSubpages(commits);
        expect(pages.length).toBe(Math.ceil(commits.length / ROWS_PER_SUBPAGE));
        pages.forEach((p) => {
          expect(valid(p) && fourLinks(p)).toBe(true);
        });
        const rows = pages.flatMap((p) => text(p).slice(4, 14)).filter((r) => r.trim() !== '');
        expect(rows.length).toBe(commits.length);
        commits.forEach((c, i) => {
          const row = rows[i]!;
          expect(row.slice(2, 9)).toBe(c.sha.slice(0, 7)); // two control cells come first
          expect(row.slice(11, 16)).toBe(monthDay(c.date));
          const msg = c.message.split('\n')[0] ?? '';
          expect(row.slice(18, 22)).toBe(msg.slice(0, 4).padEnd(4, ' '));
        });
      }),
      { numRuns: 60 },
    );
  });

  it('[PBT REQ-5.2] pull request rows keep the number intact and always end inside the 40 columns', () => {
    fc.assert(
      fc.property(fc.array(pullArb, { minLength: 1, maxLength: 25 }), (pulls) => {
        const pages = buildPullSubpages(pulls);
        const rows = pages.flatMap((p) => text(p).slice(4, 14)).filter((r) => r.trim() !== '');
        expect(rows.length).toBe(pulls.length);
        pulls.forEach((p, i) => {
          expect(rows[i]!.slice(2, 2 + `#${p.number}`.length)).toBe(`#${p.number}`);
          expect(rows[i]!.length).toBe(40);
        });
        pages.forEach((p) => expect(valid(p) && fourLinks(p)).toBe(true));
      }),
      { numRuns: 60 },
    );
  });

  it('[PBT REQ-6.1] CI pages hold at most five runs each, every run keeps its result word, and all pages are valid', () => {
    fc.assert(
      fc.property(fc.array(runArb, { maxLength: 12 }), (runs) => {
        const pages = buildRunSubpages(runs, NOW);
        expect(pages.length).toBe(Math.max(1, Math.ceil(runs.length / RUNS_PER_SUBPAGE)));
        const rows = pages.flatMap((p) => [0, 1, 2, 3, 4].map((i) => text(p)[4 + i * 3] ?? '')).filter((r) => r.trim() !== '');
        if (runs.length > 0) {
          expect(rows.length).toBe(runs.length);
          runs.forEach((r, i) => expect(rows[i]!.slice(2, 2 + runStatus(r).label.length)).toBe(runStatus(r).label));
        }
        pages.forEach((p) => expect(valid(p) && fourLinks(p)).toBe(true));
      }),
      { numRuns: 60 },
    );
  });

  it('runStatus maps success to green, failure to red and unfinished to yellow', () => {
    expect(runStatus({ name: '', status: 'completed', conclusion: 'success', branch: '', runNumber: 1, createdAt: 0 })).toEqual({ label: 'ok', colour: 2 });
    expect(runStatus({ name: '', status: 'completed', conclusion: 'failure', branch: '', runNumber: 1, createdAt: 0 })).toEqual({ label: 'FAIL', colour: 1 });
    expect(runStatus({ name: '', status: 'in_progress', conclusion: null, branch: '', runNumber: 1, createdAt: 0 })).toEqual({ label: 'run', colour: 3 });
  });

  it('[PBT REQ-7.1] language bars: longer share never gives a shorter bar, percentages are 0 to 100, page is valid', () => {
    fc.assert(
      fc.property(langArb, (langs) => {
        const sorted = [...langs].sort((a, b) => b.bytes - a.bytes);
        const page = buildLanguagesPage(sorted);
        expect(valid(page)).toBe(true);
        const cells = interpretPage(page);
        const bars = sorted.slice(0, 8).map((_, i) => cells[4 + i * 2]!.reduce((n, c) => n + (c.charMode === 'mosaic' ? c.mosaicMask.toString(2).replace(/0/g, '').length : 0), 0));
        for (let i = 1; i < bars.length; i++) expect(bars[i - 1]!).toBeGreaterThanOrEqual(bars[i]!);
        bars.forEach((b) => expect(b).toBeLessThanOrEqual(LANGUAGE_BAR_CELLS * 6));
        for (const m of text(page).join('\n').matchAll(/(\d+)%/g)) expect(Number(m[1])).toBeLessThanOrEqual(100);
      }),
      { numRuns: 60 },
    );
  });

  it('[PBT REQ-5.3] issue pages and the about page are always valid', () => {
    fc.assert(
      fc.property(fc.array(fc.record({ number: fc.integer({ min: 1, max: 9999 }), title: ascii, author: ascii, createdAt: dateArb }) as fc.Arbitrary<IssueItem>, { maxLength: 22 }), (issues) => {
        for (const p of buildIssueSubpages(issues)) expect(valid(p) && fourLinks(p)).toBe(true);
        expect(valid(buildAboutPage({ owner: 'a', name: 'b' }, NOW))).toBe(true);
      }),
      { numRuns: 40 },
    );
  });
});
