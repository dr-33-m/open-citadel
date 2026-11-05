import { describe, expect, it } from 'vitest';

import { memoryMenu, memoryRows, noteMeta, type MemoryNoteInput } from '@/features/samwell-memory/utils/memory-rows';

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

describe('memoryRows', () => {
  it('is empty when he has kept nothing', () => {
    expect(memoryRows(null, [], NOW)).toEqual([]);
  });

  it('puts his picture of them first, then a card per kind, wins before the rest', () => {
    const rows = memoryRows({ text: 'Building a clinic.', updatedAt: '2026-11-02T08:00:00' }, [
      note('a', 'about'),
      note('w', 'win'),
      note('g', 'goal_finished'),
    ], NOW);
    expect(rows.map((row) => row.key)).toEqual(['portrait', 'WINS AND MILESTONES', 'ABOUT YOU']);
    expect(rows[0]).toMatchObject({ type: 'portrait', updated: 'Updated Yesterday' });
    expect(rows[1]).toMatchObject({ notes: [{ id: 'w' }, { id: 'g' }] });
  });

  it('reads an old reflection as about them, so no note is ever hidden from the screen', () => {
    const rows = memoryRows(null, [note('r', 'reflection')], NOW);
    expect(rows).toMatchObject([{ title: 'ABOUT YOU', notes: [{ id: 'r' }] }]);
  });
});

describe('noteMeta', () => {
  it('says when, and the chat it came from', () => {
    expect(noteMeta(note('a', 'about', { sourceTitle: 'TikTok pitch' }), NOW)).toBe('Yesterday · TikTok pitch');
  });

  it('marks a commitment that was done', () => {
    expect(noteMeta(note('c', 'commitment', { resolvedAt: '2026-11-03T08:00:00' }), NOW)).toBe('Yesterday · Done');
  });

  it('leaves out a chat that is gone', () => {
    expect(noteMeta(note('a', 'about'), NOW)).toBe('Yesterday');
  });
});

describe('memoryMenu', () => {
  it('offers the chat only while it exists, and forgetting last', () => {
    expect(memoryMenu({ sourceSessionId: 's1' }).map((row) => row.key)).toEqual(['correct', 'chat', 'forget']);
    expect(memoryMenu({ sourceSessionId: null }).map((row) => row.key)).toEqual(['correct', 'forget']);
  });
});
