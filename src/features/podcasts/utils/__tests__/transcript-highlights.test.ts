import { describe, expect, it } from 'vitest';

import type { TranscriptLine } from '@/features/podcasts/utils/transcript-lines';
import { highlightLines, highlightsLabel, lineSurrounding, markedLines } from '@/features/podcasts/utils/transcript-highlights';

const line = (index: number, start: number, text: string): TranscriptLine => ({
  index,
  segment: 0,
  start,
  time: null,
  text,
  speaker: null,
  heading: null,
});

const LINES = [
  line(0, 0, 'So this episode is different.'),
  line(1, 4, 'Exactly.'),
  line(2, 9, 'He kept the company small.'),
  line(3, 15, 'Exactly.'),
  line(4, 20, 'And he never sold it.'),
];

describe('markedLines', () => {
  it('finds each highlight again by its words', () => {
    const marked = markedLines(LINES, [{ id: 'a', text: 'He kept the company small.', seconds: 9 }]);
    expect([...marked]).toEqual([[2, 'a']]);
  });

  it('takes the copy nearest its moment when a line is said twice', () => {
    expect([...markedLines(LINES, [{ id: 'a', text: 'Exactly.', seconds: 14.2 }])]).toEqual([[3, 'a']]);
    expect([...markedLines(LINES, [{ id: 'a', text: 'Exactly.', seconds: 3 }])]).toEqual([[1, 'a']]);
  });

  it('leaves out a highlight whose words are no longer a line', () => {
    expect(markedLines(LINES, [{ id: 'a', text: 'Not said.', seconds: 9 }]).size).toBe(0);
  });
});

describe('lineSurrounding', () => {
  it('keeps two lines either side', () => {
    expect(lineSurrounding(LINES, 2)).toEqual({
      before: 'So this episode is different. Exactly.',
      after: 'Exactly. And he never sold it.',
    });
  });

  it('has nothing before the first line or after the last', () => {
    expect(lineSurrounding(LINES, 0).before).toBeUndefined();
    expect(lineSurrounding(LINES, 4).after).toBeUndefined();
  });
});

describe('highlightLines', () => {
  const kept = (id: string, seconds: number | null) => ({ id, text: id, seconds, color: '', createdAt: '' });

  it('orders highlights as they are said, with their times, untimed last', () => {
    const { lines, byIndex } = highlightLines([kept('b', 754), kept('c', null), kept('a', 12)]);
    expect(byIndex.map((h) => h.id)).toEqual(['a', 'b', 'c']);
    expect(lines.map((l) => [l.index, l.time])).toEqual([
      [0, '0:12'],
      [1, '12:34'],
      [2, null],
    ]);
  });
});

describe('highlightsLabel', () => {
  it('counts them in words', () => {
    expect(highlightsLabel(1)).toBe('1 highlight');
    expect(highlightsLabel(3)).toBe('3 highlights');
  });
});
