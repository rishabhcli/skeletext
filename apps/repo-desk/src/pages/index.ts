import { PageBuilder, type RawPage } from '@skeletext/core';
import { type AppState } from '../types.js';
import { formatAge, truncate } from '../format.js';

export function buildIndexPage(state: AppState, now: number): RawPage {
  const b = new PageBuilder().header(100, 'REPO DESK');
  
  // Row 1-2: Double height repo name (title method handles double-height automatically)
  const repoName = truncate(`${state.owner}/${state.name}`, 37);
  b.title(repoName);
  
  // Row 4: Description or Loading
  if (state.repo === null) {
    b.text(4, 0, 'Loading...', { fg: 7 });
  } else {
    b.text(4, 0, truncate(state.repo.description, 40), { fg: 7 });
  }
  
  // Row 6: Stars
  if (state.repo !== null) {
    b.text(6, 0, `Stars:    ${state.repo.stars}`, { fg: 3 });
    b.text(7, 0, `Forks:    ${state.repo.forks}`, { fg: 7 });
    b.text(8, 0, `Issues:   ${state.repo.openIssues}`, { fg: 7 });
    b.text(9, 0, `Language: ${state.repo.language ?? 'Unknown'}`, { fg: 2 });
    b.text(10, 0, `License:  ${state.repo.license ?? 'None'}`, { fg: 7 });
    const ageMs = now - new Date(state.repo.pushedAt).getTime();
    b.text(11, 0, `Pushed:   ${formatAge(ageMs)}`, { fg: 7 });
  }
  
  return b.prompt(FASTEXT, LABELS).build();
}

const FASTEXT = { red: 100, green: 110, yellow: 140, cyan: 150, index: 100 } as const;
const LABELS = { red: 'Index', green: 'Commits', yellow: 'Actions', cyan: 'Langs' } as const;
