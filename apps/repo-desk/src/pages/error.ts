import { PageBuilder, type RawPage } from '@skeletext/core';

export function buildFetchErrorPage(context: string, reason: string): RawPage {
  const b = new PageBuilder().header(100, 'REPO DESK');
  b.text(2, 0, 'FETCH ERROR', { fg: 1 });
  b.text(4, 0, 'Page: ');
  b.text(4, 6, truncate(context, 34), { fg: 7 });
  b.text(6, 0, 'Reason: ');
  b.text(6, 8, truncate(reason, 32), { fg: 7 });
  return b.prompt(FASTEXT, LABELS).build();
}

const FASTEXT = { red: 100, green: 110, yellow: 140, cyan: 150, index: 100 } as const;
const LABELS = { red: 'Index', green: 'Commits', yellow: 'Actions', cyan: 'Langs' } as const;

function truncate(s: string, maxLen: number): string {
  return s.slice(0, maxLen);
}
