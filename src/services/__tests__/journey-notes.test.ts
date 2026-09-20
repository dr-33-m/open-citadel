import { describe, expect, it, vi } from 'vitest';

import {
  fitLines,
  formatJourneyNotes,
  formatOutcomeSummary,
  rankJourneyNotes,
  type JourneyNote,
} from '../journey';

// Hoisted above the imports by vitest; only the pure functions are tested.
vi.mock('@/db/client', () => ({ db: {} }));

function note(text: string, createdAt: string, tags: string[] = []): JourneyNote {
  return {
    text,
    kind: 'reflection',
    tags: tags.length > 0 ? JSON.stringify(tags) : null,
    createdAt,
  };
}

// Newest first, the order `searchJourneyNotes` reads them in.
const notes: JourneyNote[] = [
  note('Started the morning pages again after a slow week.', '2026-09-10T08:00:00.000Z'),
  note('Running keeps slipping on Mondays, after long work days.', '2026-08-01T08:00:00.000Z'),
  note('Said running is the thing that steadies them.', '2026-05-01T08:00:00.000Z', ['running']),
  note('Finished "Deep Work" by Cal Newport.', '2026-03-01T08:00:00.000Z', ['focus']),
];

describe('rankJourneyNotes', () => {
  it('matches the start of a word, not the middle of one', () => {
    // "art" is inside "Started" and must not pull that note in.
    expect(rankJourneyNotes(notes, 'art', 5).map((n) => n.text)).toEqual(
      // Nothing matches, so it falls back to the most recent.
      notes.map((n) => n.text),
    );
  });

  it('matches plurals and longer forms by prefix', () => {
    expect(rankJourneyNotes(notes, 'run', 5)).toHaveLength(2);
  });

  it('returns the chosen notes newest first, not by score', () => {
    // The May note scores higher (text and tag), but August is newer.
    const ranked = rankJourneyNotes(notes, 'running steadies', 5);
    expect(ranked.map((n) => n.createdAt)).toEqual([
      '2026-08-01T08:00:00.000Z',
      '2026-05-01T08:00:00.000Z',
    ]);
  });

  it('keeps the best matches when there are more than the limit', () => {
    const ranked = rankJourneyNotes(notes, 'running steadies', 1);
    expect(ranked.map((n) => n.createdAt)).toEqual(['2026-05-01T08:00:00.000Z']);
  });

  it('falls back to the most recent for an empty query', () => {
    expect(rankJourneyNotes(notes, '', 2)).toEqual(notes.slice(0, 2));
  });

  it('matches on tags', () => {
    expect(rankJourneyNotes(notes, 'focus', 5).map((n) => n.createdAt)).toEqual([
      '2026-03-01T08:00:00.000Z',
    ]);
  });
});

describe('fitLines', () => {
  it('drops whole lines rather than cutting one', () => {
    expect(fitLines(['aaaa', 'bbbb', 'cccc'], 9)).toBe('aaaa\nbbbb');
    expect(fitLines(['aaaa', 'bbbb'], 8)).toBe('aaaa');
  });
});

describe('formatJourneyNotes', () => {
  it('never ends in the middle of a note', () => {
    const long = Array.from({ length: 5 }, (_, i) =>
      note(`${i} ${'x'.repeat(600)}`, '2026-09-10T08:00:00.000Z'),
    );
    const lines = formatJourneyNotes(long).split('\n').slice(1);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThan(5);
    for (const line of lines) expect(line.endsWith('x'.repeat(600))).toBe(true);
  });

  it('says so when there is nothing', () => {
    expect(formatJourneyNotes([])).toMatch(/Nothing has been written down/);
  });
});

describe('formatOutcomeSummary', () => {
  it('needs both numbers', () => {
    expect(formatOutcomeSummary(12, 20, 'sessions')).toBe('12 of 20 sessions');
    expect(formatOutcomeSummary(12, 20, null)).toBe('12 of 20');
    expect(formatOutcomeSummary(null, 20, 'sessions')).toBeNull();
  });
});
