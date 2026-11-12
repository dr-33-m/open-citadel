import { describe, expect, it } from 'vitest';

import {
  memoryMenu,
  memoryRows,
  noteKind,
  noteMeta,
  notesHeading,
  type MemoryNoteInput,
  type MemoryRow,
} from '@/features/samwell-memory/utils/memory-rows';

const NOW = new Date('2026-11-03T12:00:00');

const note = (id: string, kind: string, extra: Partial<MemoryNoteInput> = {}): MemoryNoteInput => ({
  id,
  kind,
  text: `Note ${id}`,
  resolvedAt: null,
  createdAt: '2026-11-02T08:00:00',
  sourceSessionId: null,
  sourceTitle: null,
  ...extra,
});

const events = (rows: MemoryRow[]) => rows.filter((row) => row.type === 'event');

describe('memoryRows', () => {
  it('is empty when he has kept nothing', () => {
    expect(memoryRows(null, [], NOW)).toEqual([]);
  });

  it('puts his picture of them first, then a heading, then every note in the order given', () => {
    const rows = memoryRows({ text: 'Building a clinic.', updatedAt: '2026-11-02T08:00:00' }, [
      note('a', 'about'),
      note('w', 'win'),
    ], NOW);
    expect(rows.map((row) => row.key)).toEqual(['portrait', 'heading', 'a', 'w']);
    expect(rows[0]).toMatchObject({ type: 'portrait', updated: 'Updated Yesterday' });
    expect(rows[1]).toMatchObject({ title: '2 THINGS HE HAS NOTED' });
  });

  it('writes the day and the chat only where they change', () => {
    const rows = events(
      memoryRows(null, [
        note('a', 'about', { sourceTitle: 'TikTok pitch' }),
        note('b', 'win', { sourceTitle: 'TikTok pitch' }),
        note('c', 'about', { sourceTitle: 'Carnegie', createdAt: '2026-10-25T08:00:00' }),
        note('d', 'about', { sourceTitle: 'Carnegie', createdAt: '2026-10-25T07:00:00' }),
      ], NOW),
    );
    expect(rows.map((row) => row.context)).toEqual(['Yesterday · TikTok pitch', null, expect.stringMatching(/ · Carnegie$/), null]);
  });

  it('names the chat again when it changes within a day', () => {
    const rows = events(
      memoryRows(null, [note('a', 'about', { sourceTitle: 'One' }), note('b', 'about', { sourceTitle: 'Two' })], NOW),
    );
    expect(rows.map((row) => row.context)).toEqual(['Yesterday · One', 'Two']);
  });

  it('stops the rail at the last note', () => {
    const rows = events(memoryRows(null, [note('a', 'about'), note('b', 'about')], NOW));
    expect(rows.map((row) => row.last)).toEqual([false, true]);
  });
});

describe('noteKind', () => {
  it('marks progress, strain and promises apart', () => {
    expect(noteKind(note('w', 'win'))).toEqual({ label: 'WIN', tone: 'success' });
    expect(noteKind(note('s', 'struggle'))).toEqual({ label: 'WORKING THROUGH', tone: 'warning' });
    expect(noteKind(note('c', 'commitment'))).toEqual({ label: 'SAID THEY WOULD', tone: 'info' });
  });

  it('reads a promise kept as kept', () => {
    expect(noteKind(note('c', 'commitment', { resolvedAt: '2026-11-03T08:00:00' }))).toEqual({
      label: 'DID WHAT THEY SAID',
      tone: 'success',
    });
  });

  it('reads an old reflection, or any kind it does not know, as about them', () => {
    expect(noteKind(note('r', 'reflection')).label).toBe('ABOUT YOU');
    expect(noteKind(note('x', 'something_new')).label).toBe('ABOUT YOU');
  });
});

describe('notesHeading', () => {
  it('counts', () => {
    expect(notesHeading(1)).toBe('1 THING HE HAS NOTED');
    expect(notesHeading(12)).toBe('12 THINGS HE HAS NOTED');
  });
});

describe('noteMeta', () => {
  it('says when, and the chat it came from', () => {
    expect(noteMeta(note('a', 'about', { sourceTitle: 'TikTok pitch' }), NOW)).toBe('Yesterday · TikTok pitch');
  });

  it('marks a commitment that was done', () => {
    expect(noteMeta(note('c', 'commitment', { resolvedAt: '2026-11-03T08:00:00' }), NOW)).toBe('Yesterday · Done');
  });
});

describe('memoryMenu', () => {
  it('offers the chat only while it exists, and forgetting last', () => {
    expect(memoryMenu({ sourceSessionId: 's1' }).map((row) => row.key)).toEqual(['correct', 'chat', 'forget']);
    expect(memoryMenu({ sourceSessionId: null }).map((row) => row.key)).toEqual(['correct', 'forget']);
  });
});
