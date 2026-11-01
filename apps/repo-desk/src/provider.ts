import type { PageProvider, ProvidedPage } from '@skeletext/core';
import { getJson, paths, parseCommits, parseIssues, parseLanguages, parsePulls, parseRepoInfo, parseRuns, type Deps } from './github.js';
import { buildAboutPage, buildCommitSubpages, buildIndexPage, buildIssueSubpages, buildLanguagesPage, buildPullSubpages, buildRunSubpages, FASTEXT } from './pages.js';
import type { RepoRef } from './types.js';

/** Pages are built lazily: each page number fetches only the endpoint it needs, the first time it is opened. */
export function createProvider(repo: RepoRef, deps: Deps): PageProvider {
  const p = paths(repo);
  const memo = new Map<string, Promise<unknown>>();
  const get = (path: string): Promise<unknown> => {
    let hit = memo.get(path);
    if (!hit) {
      hit = getJson(path, deps);
      memo.set(path, hit);
      hit.catch(() => memo.delete(path)); // a failure can be retried
    }
    return hit;
  };
  const wrap = (subpages: ProvidedPage['subpages']): ProvidedPage => ({ subpages, fastext: FASTEXT });

  return async (n) => {
    switch (n) {
      case 100:
        return wrap([buildIndexPage(repo, parseRepoInfo(await get(p.repo)), deps.now())]);
      case 110:
        return wrap(buildCommitSubpages(parseCommits(await get(p.commits))));
      case 120:
        return wrap(buildPullSubpages(parsePulls(await get(p.pulls))));
      case 130:
        return wrap(buildIssueSubpages(parseIssues(await get(p.issues))));
      case 140:
        return wrap(buildRunSubpages(parseRuns(await get(p.runs)), deps.now()));
      case 150:
        return wrap([buildLanguagesPage(parseLanguages(await get(p.languages)))]);
      case 199:
        return wrap([buildAboutPage(repo, deps.now())]);
      default:
        return null;
    }
  };
}
