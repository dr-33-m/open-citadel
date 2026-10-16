import { describe, expect, it } from 'vitest';

import { importOutcome, importProgressLabel, importStats } from '@/features/podcasts/utils/import-summary';
import { formatCount } from '@/utils/format';

const summary = { shows: 24, episodes: 3412, inProgress: 0, played: 1200, favorites: 1, queued: 0, skipped: 0 };

describe('formatCount', () => {
  it('groups thousands', () => {
    expect(formatCount(3412)).toBe('3,412');
    expect(formatCount(1234567)).toBe('1,234,567');
    expect(formatCount(999)).toBe('999');
  });
});

describe('importStats', () => {
  it('always counts shows and episodes, and only what happened after that', () => {
    const stats = importStats({ kind: 'database', summary });
    expect(stats.map((s) => s.key)).toEqual(['shows', 'episodes', 'played', 'favorites']);
    expect(stats[1]).toEqual({ key: 'episodes', value: '3,412', label: 'EPISODES' });
    expect(stats[3].label).toBe('FAVORITE');
  });

  it('counts an OPML import in followed shows, and unreachable feeds only when there were some', () => {
    expect(importStats({ kind: 'opml', added: 5, failed: 0 })).toEqual([{ key: 'shows', value: '5', label: 'SHOWS FOLLOWED' }]);
    expect(importStats({ kind: 'opml', added: 5, failed: 1 })[1].label).toBe('FEED UNREACHABLE');
  });
});

describe('importOutcome', () => {
  it('welcomes a database import back and points an OPML one at the history it left behind', () => {
    expect(importOutcome({ kind: 'database', summary }).title).toBe('Welcome back');
    expect(importOutcome({ kind: 'opml', added: 1, failed: 0 }).note).toMatch(/database export/);
  });

  it('says when local-folder shows stayed behind', () => {
    expect(importOutcome({ kind: 'database', summary }).note).not.toMatch(/local-folder/);
    expect(importOutcome({ kind: 'database', summary: { ...summary, skipped: 2 } }).note).toMatch(/2 local-folder shows stayed behind/);
  });
});

describe('importProgressLabel', () => {
  it('says the file is being read before the shows are counted', () => {
    expect(importProgressLabel(0, 0)).toBe('READING THE FILE');
    expect(importProgressLabel(3, 48)).toBe('3 OF 48 SHOWS');
  });
});
