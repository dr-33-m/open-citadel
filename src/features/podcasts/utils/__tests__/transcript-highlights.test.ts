import { describe, expect, it } from 'vitest';

import type { TranscriptLine } from '@/features/podcasts/utils/transcript-lines';
import { highlightsLabel, lineSurrounding, markedLines } from '@/features/podcasts/utils/transcript-highlights';

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

const kept = (id: string, text: string, seconds: number | null, color: string | null = null) => ({
  id,
  text,
  color,
  locator: JSON.stringify({ href: 'OEBPS/part1.xhtml', locations: { fragments: seconds === null ? ['s0'] : ['s0', `t=${seconds}`] } }),
});

describe('markedLines', () => {
  it('finds each highlight again by its words, with its colour', () => {
    const marked = markedLines(LINES, [kept('a', 'He kept the company small.', 9, '#81c784')]);
    expect([...marked]).toEqual([[2, { id: 'a', color: '#81c784' }]]);
  });

  it('takes the copy nearest its moment when a line is said twice', () => {
    expect([...markedLines(LINES, [kept('a', 'Exactly.', 14.2)]).keys()]).toEqual([3]);
    expect([...markedLines(LINES, [kept('a', 'Exactly.', 3)]).keys()]).toEqual([1]);
    expect([...markedLines(LINES, [kept('a', 'Exactly.', null)]).keys()]).toEqual([1]);
  });

  it('gives a highlight with no colour the default gold', () => {
    expect(markedLines(LINES, [kept('a', 'Exactly.', 3)]).get(1)?.color).toBe('#f2ca50');
  });

  it('leaves out a highlight whose words are no longer a line', () => {
    expect(markedLines(LINES, [kept('a', 'Not said.', 9)]).size).toBe(0);
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

describe('highlightsLabel', () => {
  it('counts them in words', () => {
    expect(highlightsLabel(1)).toBe('1 highlight');
    expect(highlightsLabel(3)).toBe('3 highlights');
  });
});
