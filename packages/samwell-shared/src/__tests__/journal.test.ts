import { describe, expect, it } from 'vitest';

import { JournalResponseSchema, MAX_JOURNAL_PROFILE, normalizeJournalNotes, normalizeJournalWriteUp } from '../journal';

describe('normalizeJournalNotes', () => {
  it('returns an empty list for nothing worth keeping', () => {
    expect(normalizeJournalNotes({ notes: [] })).toEqual([]);
  });

  it('cleans, dedupes and caps what the model wrote', () => {
    const notes = normalizeJournalNotes({
      notes: [
        { text: '  "Wants to run a half marathon in March."  ', tags: ['Running', '#running', ' goals '], kind: null, due_on: null },
        { text: 'wants to run a half marathon in march.', tags: null, kind: null, due_on: null },
        { text: '   ', tags: ['empty'], kind: null, due_on: null },
        { text: 'Works late shifts on Mondays.', tags: null, kind: null, due_on: null },
        { text: 'Values quiet mornings.', tags: [], kind: null, due_on: null },
        { text: 'A fourth note that should be dropped.', tags: [], kind: null, due_on: null },
      ],
    });
    expect(notes).toEqual([
      { text: 'Wants to run a half marathon in March.', tags: ['running', 'goals'], kind: 'about', dueOn: null },
      { text: 'Works late shifts on Mondays.', tags: [], kind: 'about', dueOn: null },
      { text: 'Values quiet mornings.', tags: [], kind: 'about', dueOn: null },
    ]);
    expect(JournalResponseSchema.safeParse({ notes }).success).toBe(true);
  });

  it('cuts an overlong note at a sentence, within the contract', () => {
    const long = `${'They keep coming back to the same worry about work. '.repeat(8)}`;
    const [note] = normalizeJournalNotes({ notes: [{ text: long, tags: null, kind: null, due_on: null }] });
    expect(note.text.length).toBeLessThanOrEqual(280);
    expect(note.text.endsWith('.')).toBe(true);
    expect(JournalResponseSchema.safeParse({ notes: [note] }).success).toBe(true);
  });

  it('cuts one long sentence at a word', () => {
    const [note] = normalizeJournalNotes({ notes: [{ text: 'word '.repeat(100), tags: null, kind: null, due_on: null }] });
    expect(note.text.length).toBeLessThanOrEqual(280);
    expect(note.text.endsWith('word…')).toBe(true);
  });
});

describe('kinds and dates', () => {
  const one = (kind: string | null, due_on: string | null = null) =>
    normalizeJournalNotes({ notes: [{ text: 'A thing.', tags: null, kind, due_on }] })[0];

  it('keeps a kind it knows, and files anything else as about them', () => {
    expect(one('win').kind).toBe('win');
    expect(one(' WIN ').kind).toBe('win');
    expect(one('triumph').kind).toBe('about');
    expect(one(null).kind).toBe('about');
  });

  it('keeps a date only on a commitment, and only a real one', () => {
    expect(one('commitment', '2026-11-05').dueOn).toBe('2026-11-05');
    expect(one('commitment', 'next Friday').dueOn).toBeNull();
    expect(one('win', '2026-11-05').dueOn).toBeNull();
  });
});

describe('normalizeJournalWriteUp', () => {
  const base = { notes: [], profile: null, resolved_commitments: null };

  it('keeps the profile he has when there is nothing new', () => {
    expect(normalizeJournalWriteUp(base, []).profile).toBeNull();
    expect(normalizeJournalWriteUp({ ...base, profile: '   ' }, []).profile).toBeNull();
  });

  it('holds the profile to its size, whole sentences first', () => {
    const profile = 'They are building a clinic in their home town. '.repeat(60);
    const out = normalizeJournalWriteUp({ ...base, profile }, []);
    expect(out.profile!.length).toBeLessThanOrEqual(MAX_JOURNAL_PROFILE);
    expect(out.profile!.endsWith('.')).toBe(true);
    expect(JournalResponseSchema.safeParse(out).success).toBe(true);
  });

  it('only closes commitments it was shown', () => {
    const out = normalizeJournalWriteUp({ ...base, resolved_commitments: ['a', 'a', 'made-up'] }, ['a', 'b']);
    expect(out.resolved).toEqual(['a']);
  });

  it('answers a build that sent none of this with what it can read', () => {
    const out = normalizeJournalWriteUp(base, []);
    expect(JournalResponseSchema.safeParse(out).success).toBe(true);
  });
});
