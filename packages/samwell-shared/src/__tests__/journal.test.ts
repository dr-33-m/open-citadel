import { describe, expect, it } from 'vitest';

import { JournalResponseSchema, normalizeJournalNotes } from '../journal';

describe('normalizeJournalNotes', () => {
  it('returns an empty list for nothing worth keeping', () => {
    expect(normalizeJournalNotes({ notes: [] })).toEqual([]);
  });

  it('cleans, dedupes and caps what the model wrote', () => {
    const notes = normalizeJournalNotes({
      notes: [
        { text: '  "Wants to run a half marathon in March."  ', tags: ['Running', '#running', ' goals '] },
        { text: 'wants to run a half marathon in march.', tags: null },
        { text: '   ', tags: ['empty'] },
        { text: 'Works late shifts on Mondays.', tags: null },
        { text: 'Values quiet mornings.', tags: [] },
        { text: 'A fourth note that should be dropped.', tags: [] },
      ],
    });
    expect(notes).toEqual([
      { text: 'Wants to run a half marathon in March.', tags: ['running', 'goals'] },
      { text: 'Works late shifts on Mondays.', tags: [] },
      { text: 'Values quiet mornings.', tags: [] },
    ]);
    expect(JournalResponseSchema.safeParse({ notes }).success).toBe(true);
  });

  it('cuts an overlong note at a sentence, within the contract', () => {
    const long = `${'They keep coming back to the same worry about work. '.repeat(8)}`;
    const [note] = normalizeJournalNotes({ notes: [{ text: long, tags: null }] });
    expect(note.text.length).toBeLessThanOrEqual(280);
    expect(note.text.endsWith('.')).toBe(true);
    expect(JournalResponseSchema.safeParse({ notes: [note] }).success).toBe(true);
  });

  it('cuts one long sentence at a word', () => {
    const [note] = normalizeJournalNotes({ notes: [{ text: 'word '.repeat(100), tags: null }] });
    expect(note.text.length).toBeLessThanOrEqual(280);
    expect(note.text.endsWith('word…')).toBe(true);
  });
});
