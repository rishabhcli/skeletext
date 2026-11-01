import { PageBuilder, type RawPage } from '@skeletext/core';
import { type CommitItem } from '../types.js';
import { formatDate, truncate } from '../format.js';

export function buildCommitSubpages(commits: CommitItem[]): RawPage[] {
  const out: RawPage[] = [];
  const rowsPerSubpage = 10;
  
  for (let start = 0; start < commits.length; start += rowsPerSubpage) {
    const b = new PageBuilder().header(110, 'REPO DESK');
    
    // Commit rows
    const subpageCommits = commits.slice(start, start + rowsPerSubpage);
    subpageCommits.forEach((commit, i) => {
      const row = 3 + i;
      const shortSha = commit.sha.slice(0, 7);
      const date = formatDate(commit.date);
      const author = truncate(commit.author, 12);
      const message = commit.message.split('\n')[0];
      
      // Columns 0-6: SHA (7 chars)
      b.text(row, 0, shortSha, { fg: 7 });
      // Column 7: space (0x20)
      // Columns 8-12: date MM-DD (5 chars)
      b.text(row, 8, date, { fg: 7 });
      // Column 13: space (0x20)
      // Columns 14-25: author (12 chars)
      b.text(row, 14, author, { fg: 7 });
      // Column 26: space (0x20)
      // Columns 27-39: message first line (13 chars)
      b.text(row, 27, truncate(message ?? '', 13), { fg: 7 });
    });
    
    // Row 1: subpage indicator (right-aligned in 40 columns)
    const currentPage = Math.floor(start / rowsPerSubpage);
    const totalPages = Math.ceil(commits.length / rowsPerSubpage) || 1;
    const indicator = `${currentPage + 1}/${totalPages}`;
    // Write indicator starting at column 37
    // Color at col 0, indicator starts at col 37 (3 chars: 1/1, 2/2, etc.)
    // Room at col 37: color, col 38: first char, col 39: second char = 2 chars max
    // So we can only fit 2 chars. Use '1/' and '2/' for 1/1 and 2/2.
    b.text(1, 37, indicator, { fg: 5 });
    
    out.push(b.prompt(FASTEXT, LABELS).build());
  }
  
  // If no commits, ensure at least one subpage
  if (out.length === 0) {
    const b = new PageBuilder().header(110, 'REPO DESK');
    b.text(5, 0, 'No commits', { fg: 7 });
    b.text(1, 0, '1/1'.padStart(40, ' '), { fg: 5 });
    out.push(b.prompt(FASTEXT, LABELS).build());
  }
  
  return out;
}

const FASTEXT = { red: 100, green: 110, yellow: 140, cyan: 150, index: 100 } as const;
const LABELS = { red: 'Index', green: 'Commits', yellow: 'Actions', cyan: 'Langs' } as const;
