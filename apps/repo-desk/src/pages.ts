import { PageBuilder, wrapText, toAscii, type Colour, type FastextConfig, type FastextLabels, type RawPage } from '@skeletext/core';
import type { CommitItem, IssueItem, LanguageShare, PullItem, RepoInfo, RepoRef, RunItem } from './types.js';
import { ago, compact, hhmm, monthDay, percent } from './format.js';

export const SERVICE = 'REPO DESK';
export const PAGE_NUMBERS: readonly number[] = [100, 110, 120, 130, 140, 150, 199];
export const FASTEXT: FastextConfig = { red: 100, green: 110, yellow: 140, cyan: 150, index: 100 };
export const LABELS: FastextLabels = { red: 'Index', green: 'Commits', yellow: 'CI runs', cyan: 'Languages' };

export const ROWS_PER_SUBPAGE = 10;
export const RUNS_PER_SUBPAGE = 5;

const base = (n: number, title: string) => new PageBuilder().header(n, SERVICE).title(title);
const finish = (b: PageBuilder): RawPage => b.prompt(FASTEXT, LABELS).build();
const firstLine = (s: string) => toAscii(s.split('\n')[0] ?? '');

/** Split rows into subpages and build one page per chunk, or one page with an empty message. */
function paged<T>(items: T[], size: number, build: (chunk: T[], index: number, count: number) => RawPage, empty: () => RawPage): RawPage[] {
  if (items.length === 0) return [empty()];
  const out: RawPage[] = [];
  for (let start = 0; start < items.length; start += size) out.push(build(items.slice(start, start + size), out.length, Math.ceil(items.length / size)));
  return out;
}

const emptyPage = (n: number, title: string, message: string) => () => finish(base(n, title).text(5, 0, message, { fg: 7 }));

export function buildIndexPage(repo: RepoRef, info: RepoInfo, now: number): RawPage {
  const b = base(100, `${repo.owner}/${repo.name}`);
  const desc = info.description === '' ? ['No description.'] : wrapText(info.description, 36).slice(0, 2);
  desc.forEach((line, i) => b.text(4 + i, 0, line, { fg: 3 }));
  b.listRow(7, 'Stars', compact(info.stars));
  b.listRow(8, 'Forks', compact(info.forks));
  b.listRow(9, 'Open issues and pulls', String(info.openIssuesAndPulls));
  b.listRow(10, 'Language', info.language ?? 'none');
  b.listRow(11, 'License', info.license ?? 'none');
  b.listRow(12, 'Last push', info.pushedAt === null ? 'never' : ago(info.pushedAt, now));
  b.listRow(13, 'Default branch', info.defaultBranch);
  if (info.archived) b.text(14, 0, 'This repository is archived.', { fg: 1 });
  b.heading(16, 'Pages');
  (
    [
      ['Latest commits', '110'],
      ['Open pull requests', '120'],
      ['Open issues', '130'],
      ['GitHub Actions runs', '140'],
      ['Languages', '150'],
    ] as const
  ).forEach(([label, page], i) => b.listRow(17 + i, label, page));
  return finish(b);
}

export function buildCommitSubpages(commits: CommitItem[]): RawPage[] {
  return paged(
    commits,
    ROWS_PER_SUBPAGE,
    (chunk, index, count) => {
      const b = base(110, 'Commits');
      b.text(3, 0, 'Commit  Date  Message', { fg: 3 });
      chunk.forEach((c, i) => {
        const row = 4 + i;
        b.text(row, 0, c.sha.slice(0, 7), { fg: 6 });
        b.text(row, 9, monthDay(c.date), { fg: 2 });
        b.text(row, 16, firstLine(c.message), { fg: 7 });
      });
      b.text(20, 0, `Newest first, ${index * ROWS_PER_SUBPAGE + 1} to ${index * ROWS_PER_SUBPAGE + chunk.length}`, { fg: 5 });
      if (count > 1) b.text(21, 0, 'The page turns by itself.', { fg: 5 });
      return finish(b);
    },
    emptyPage(110, 'Commits', 'No commits found.'),
  );
}

function numbered<T extends { number: number; title: string; createdAt: number }>(n: number, title: string, items: T[], empty: string, mark: (x: T) => string): RawPage[] {
  return paged(
    items,
    ROWS_PER_SUBPAGE,
    (chunk) => {
      const b = base(n, title);
      b.text(3, 0, 'No.   Title', { fg: 3 });
      chunk.forEach((x, i) => {
        const row = 4 + i;
        b.text(row, 0, `#${x.number}`, { fg: 2 });
        b.text(row, 8, `${mark(x)}${toAscii(x.title)}`, { fg: 7 });
      });
      b.text(21, 0, `${items.length} open`, { fg: 5 });
      return finish(b);
    },
    emptyPage(n, title, empty),
  );
}

export const buildPullSubpages = (pulls: PullItem[]) => numbered(120, 'Pull requests', pulls, 'No open pull requests.', (p) => (p.draft ? '[draft] ' : ''));
export const buildIssueSubpages = (issues: IssueItem[]) => numbered(130, 'Issues', issues, 'No open issues.', () => '');

export function runStatus(run: RunItem): { label: string; colour: Colour } {
  if (run.status !== 'completed') return { label: 'run', colour: 3 };
  switch (run.conclusion) {
    case 'success':
      return { label: 'ok', colour: 2 };
    case 'failure':
    case 'timed_out':
      return { label: 'FAIL', colour: 1 };
    case 'cancelled':
      return { label: 'stop', colour: 5 };
    default:
      return { label: 'skip', colour: 5 };
  }
}

export function buildRunSubpages(runs: RunItem[], now: number): RawPage[] {
  return paged(
    runs,
    RUNS_PER_SUBPAGE,
    (chunk) => {
      const b = base(140, 'CI runs');
      b.text(3, 0, 'Result  Workflow', { fg: 3 });
      chunk.forEach((r, i) => {
        const row = 4 + i * 3;
        const s = runStatus(r);
        b.text(row, 0, s.label, { fg: s.colour });
        b.text(row, 8, `${toAscii(r.name)} #${r.runNumber}`, { fg: 7 });
        b.text(row + 1, 8, `${toAscii(r.branch)}, ${toAscii(r.status === 'completed' ? (r.conclusion ?? 'done') : r.status)}`, { fg: 5 });
        b.text(row + 2, 8, `${ago(r.createdAt, now)}, ${hhmm(r.createdAt)} UTC`, { fg: 5 });
      });
      return finish(b);
    },
    emptyPage(140, 'CI runs', 'No GitHub Actions runs found.'),
  );
}

const BAR_COLOURS: Colour[] = [6, 3, 2, 5, 1, 4, 7, 6];
export const LANGUAGE_ROWS = 8;
export const LANGUAGE_BAR_CELLS = 16;

export function buildLanguagesPage(languages: LanguageShare[]): RawPage {
  const b = base(150, 'Languages');
  const total = languages.reduce((n, l) => n + l.bytes, 0);
  if (languages.length === 0) return finish(b.text(5, 0, 'No language data for this repository.', { fg: 7 }));
  languages.slice(0, LANGUAGE_ROWS).forEach((l, i) => {
    const row = 4 + i * 2;
    b.text(row, 0, l.name, { fg: 2 });
    b.mosaicBar(row, 13, LANGUAGE_BAR_CELLS, l.bytes / total, BAR_COLOURS[i % BAR_COLOURS.length] as Colour);
    b.text(row, 32, percent(l.bytes, total), { fg: 7 });
  });
  b.text(21, 0, 'Share of code by size, from GitHub.', { fg: 5 });
  return finish(b);
}

export function buildAboutPage(repo: RepoRef, now: number): RawPage {
  const b = base(199, 'About');
  ['Repo Desk shows the public status of a', 'GitHub repository as teletext pages.'].forEach((l, i) => b.text(4 + i, 0, l, { fg: 7 }));
  b.listRow(7, 'Showing', `${repo.owner}/${repo.name}`.slice(0, 24));
  b.heading(9, 'Limits');
  [
    'GitHub allows 60 anonymous requests an hour',
    'for each visitor. Pages load when opened and',
    'answers are kept for five minutes.',
  ].forEach((l, i) => b.text(10 + i, 0, l, { fg: 7 }));
  b.heading(14, 'Another repository');
  b.text(15, 0, 'Add ?repo=owner/name to the address.', { fg: 2 });
  b.text(17, 0, `Page built at ${hhmm(now)} UTC`, { fg: 5 });
  b.text(19, 0, 'Built on skeletext, MIT licensed:', { fg: 3 });
  b.text(20, 0, 'github.com/rishabhcli/skeletext', { fg: 6 });
  return finish(b);
}
