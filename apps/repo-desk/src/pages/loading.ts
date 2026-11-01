import { PageBuilder, type RawPage } from '@skeletext/core';

export function buildLoadingPage(pageNum: number): RawPage {
  const pageStr = String(pageNum).padStart(3, '0');
  const b = new PageBuilder().header(pageNum, 'REPO DESK');
  b.text(5, 0, 'Loading...', { fg: 7 });
  return b.prompt(FASTEXT, LABELS).build();
}

const FASTEXT = { red: 100, green: 110, yellow: 140, cyan: 150, index: 100 } as const;
const LABELS = { red: 'Index', green: 'Commits', yellow: 'Actions', cyan: 'Langs' } as const;
