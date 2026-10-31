// Built-in system pages (REQ-12): not found, error and loading screens shared by every app.

import type { RawPage } from './types.js';
import { PageBuilder, wrapText } from './builder.js';
import type { FastextConfig } from './fastext.js';

const DEFAULT_LABELS = { red: 'Index', green: '', yellow: '', cyan: '' };

function withPrompt(b: PageBuilder, fastext?: FastextConfig, labels = DEFAULT_LABELS): PageBuilder {
  return fastext ? b.prompt(fastext, labels) : b;
}

export function makeNotFoundPage(pageNumber: number, fastext?: FastextConfig): RawPage {
  const b = new PageBuilder().header(pageNumber, 'SKELETEXT').title('Page not found');
  b.text(5, 0, `Page ${pageNumber} does not exist here.`, { fg: 7 });
  b.text(7, 0, 'Type another three digit page number,', { fg: 2 });
  b.text(8, 0, 'or press the red key for the index.', { fg: 2 });
  return withPrompt(b, fastext).build();
}

export function makeErrorPage(title: string, message: string, fastext?: FastextConfig, pageNumber = 100): RawPage {
  const b = new PageBuilder().header(pageNumber, 'SKELETEXT').title(title.slice(0, 30));
  const lines = wrapText(message, 34).slice(0, 12);
  lines.forEach((line, i) => b.text(5 + i, 0, line, { fg: 1 }));
  return withPrompt(b, fastext).build();
}

export function makeLoadingPage(pageNumber: number): RawPage {
  return new PageBuilder()
    .header(pageNumber, 'SKELETEXT')
    .title('Please wait')
    .text(5, 0, `Fetching page ${pageNumber}`, { fg: 3, flash: true })
    .build();
}
