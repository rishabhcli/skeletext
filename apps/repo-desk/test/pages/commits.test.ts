import { describe, it, expect } from 'vitest';
import { getRow, type RawPage } from '@skeletext/core';
import { buildCommitSubpages } from '../../src/pages/commits.js';

describe('buildCommitSubpages', () => {
  it('always returns exactly 1 RawPage for all commit counts', () => {
    const result0 = buildCommitSubpages([]);
    expect(result0.length).toBe(1);
    
    const result1 = buildCommitSubpages([{ sha: 'a'.repeat(40), date: '2024-01-01T00:00:00Z', author: 'test', message: 'msg' }]);
    expect(result1.length).toBe(1);
    
    const commits10 = Array.from({ length: 10 }, (_, i) => ({
      sha: `${i}`.repeat(40),
      date: '2024-01-01T00:00:00Z',
      author: 'test',
      message: 'msg',
    }));
    const result10 = buildCommitSubpages(commits10);
    expect(result10.length).toBe(1);
  });

  it('each returned page is 960 bytes', () => {
    const commits = Array.from({ length: 20 }, (_, i) => ({
      sha: `${i}`.repeat(40),
      date: '2024-01-01T00:00:00Z',
      author: 'test',
      message: 'msg',
    }));
    const result = buildCommitSubpages(commits);
    expect(result.length).toBeGreaterThan(0);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const firstPage = result[0]!;
    expect(firstPage.length).toBe(960);
  });

  it('with 10 commits, subpage has non-space bytes in rows 3-12', () => {
    const commits = Array.from({ length: 10 }, (_, i) => ({
      sha: `${i}`.repeat(40),
      date: '2024-01-01T00:00:00Z',
      author: 'test',
      message: 'msg',
    }));
    const result = buildCommitSubpages(commits);
    expect(result.length).toBe(1);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const page = result[0]!;
    
    // Check subpage has data in rows 3-12
    for (let r = 3; r <= 12; r++) {
      const row = getRow(page, r)!;
      let hasData = false;
      for (let c = 0; c < 40; c++) {
        if (row[c] !== undefined && row[c] !== 0x20) {
          hasData = true;
          break;
        }
      }
      expect(hasData).toBe(true);
    }
  });

  it('row 1 of subpage shows subpage indicator', () => {
    const commits = Array.from({ length: 20 }, (_, i) => ({
      sha: `${i}`.repeat(40),
      date: '2024-01-01T00:00:00Z',
      author: 'test',
      message: 'msg',
    }));
    const result = buildCommitSubpages(commits);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const page = result[0]!;
    const row1 = getRow(page, 1)!;
    
    // Row 1 should have indicator '1/1' at the end
    // Convert to string, treating control codes as spaces
    const chars: string[] = [];
    for (let i = 0; i < 40; i++) {
      const b = row1[i] ?? 0x20;
      if (b >= 0x20 && b <= 0x7e) {
        chars.push(String.fromCharCode(b));
      } else {
        chars.push(' ');
      }
    }
    const rowStr = chars.join('');
    // 1/1 should be at the end after padding
    expect(rowStr).toMatch(/1\/1\s*$/);
  });
});

describe('buildCommitSubpages property tests', () => {
  it('REQ-9.7 bytes written for one commit row total exactly 40', () => {
    const commits = Array.from({ length: 5 }, (_, i) => ({
      sha: `${i}`.repeat(40),
      date: '2024-01-01T00:00:00Z',
      author: 'test author',
      message: 'commit message',
    }));
    const result = buildCommitSubpages(commits);
    const page = result[0] as RawPage;
    
    for (let r = 3; r <= 7; r++) {
      const row = getRow(page, r)!;
      expect(row.length).toBe(40);
    }
  });
});
