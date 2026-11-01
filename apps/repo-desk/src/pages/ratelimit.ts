import { PageBuilder, type RawPage } from '@skeletext/core';
import { formatDate } from '../format.js';

export function buildRateLimitPage(resetHeader: string | null): RawPage {
  const b = new PageBuilder().header(100, 'REPO DESK');
  b.text(2, 0, 'RATE LIMITED', { fg: 1 });
  b.text(4, 0, 'GitHub allows 60 requests/hour', { fg: 7 });
  b.text(6, 0, 'Reset: ');
  if (resetHeader !== null) {
    b.text(6, 7, formatResetTime(resetHeader), { fg: 7 });
  } else {
    b.text(6, 7, 'unavailable', { fg: 7 });
  }
  return b.prompt(FASTEXT, LABELS).build();
}

export function formatResetTime(header: string): string {
  const resetMs = Number(header) * 1000;
  const date = new Date(resetMs);
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds} UTC`;
}

const FASTEXT = { red: 100, green: 110, yellow: 140, cyan: 150, index: 100 } as const;
const LABELS = { red: 'Index', green: 'Commits', yellow: 'Actions', cyan: 'Langs' } as const;
