import { describe, expect, it } from 'vitest';

import { memoryBlock, type MemoryFacts } from '@/utils/samwell-memory-block';

const NOTHING: MemoryFacts = { profile: null, wins: [], commitments: [], shows: [], blogs: [] };

describe('memoryBlock', () => {
  it('sends nothing when he knows nothing', () => {
    expect(memoryBlock(NOTHING)).toBe('');
    expect(memoryBlock({ ...NOTHING, profile: '   ' })).toBe('');
  });

  it('has everything he should have at hand, under the name the prompt uses', () => {
    const block = memoryBlock({
      profile: 'Building a clinic. Dreads conflict.',
      wins: [{ text: 'Told their manager no.', on: '2026-10-02' }],
      commitments: [
        { text: 'Call the landlord.', dueOn: '2026-11-05' },
        { text: 'Walk at lunch.', dueOn: null },
      ],
      shows: ['The Daily'],
      blogs: ['James Clear'],
    });
    expect(block.startsWith('What you know about them:\nBuilding a clinic.')).toBe(true);
    expect(block).toContain('- 2026-10-02: Told their manager no.');
    expect(block).toContain('- Call the landlord. (by 2026-11-05)');
    expect(block).toContain('- Walk at lunch.\n');
    expect(block).toContain('Also taking in lately: shows: The Daily; blogs: James Clear');
  });

  it('leaves out what is empty', () => {
    const block = memoryBlock({ ...NOTHING, shows: ['The Daily'] });
    expect(block).toBe('What you know about them:\nAlso taking in lately: shows: The Daily');
  });

  it('keeps a long note from eating the block', () => {
    const block = memoryBlock({ ...NOTHING, wins: [{ text: 'word '.repeat(200), on: '2026-01-01' }] });
    expect(block.length).toBeLessThan(400);
  });
});
