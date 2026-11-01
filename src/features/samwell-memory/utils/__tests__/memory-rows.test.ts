import { describe, expect, it } from 'vitest';

import { memoryRows, memorySubtitle, type MemoryNoteInput } from '@/features/samwell-memory/utils/memory-rows';

const note = (id: string, kind: string, resolvedAt: string | null = null): MemoryNoteInput => ({
  id,
  kind,
  text: `Note ${id}`,
  resolvedAt,
  createdAt: '2026-10-01T08:00:00.000Z',
});

describe('memoryRows', () => {
  it('is empty when he has kept nothing', () => {
    expect(memoryRows(null, [])).toEqual([]);
  });

  it('puts how he sees them first, then wins, and groups the kinds', () => {
    const rows = memoryRows('Building a clinic.', [note('a', 'about'), note('w', 'win'), note('g', 'goal_finished')]);
    expect(rows.map((row) => row.key)).toEqual([
      'label-profile',
      'profile',
      'label-WINS AND MILESTONES',
      'w',
      'g',
      'label-ABOUT YOU',
      'a',
    ]);
  });

  it('reads an old reflection as about them, so no note is ever hidden from the screen', () => {
    const rows = memoryRows(null, [note('r', 'reflection')]);
    expect(rows.some((row) => row.type === 'note' && row.id === 'r')).toBe(true);
  });

  it('marks a closed commitment', () => {
    const rows = memoryRows(null, [note('c', 'commitment', '2026-10-02T08:00:00.000Z')]);
    expect(rows[1]).toMatchObject({ type: 'note', closed: true });
  });
});

describe('memorySubtitle', () => {
  it('counts notes', () => {
    expect(memorySubtitle(null, 0)).toBe('NOTHING YET');
    expect(memorySubtitle('x', 0)).toBe('HOW HE SEES YOU');
    expect(memorySubtitle(null, 1)).toBe('1 NOTE');
    expect(memorySubtitle('x', 12)).toBe('12 NOTES');
  });
});
