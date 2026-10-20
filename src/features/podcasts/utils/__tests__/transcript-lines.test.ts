import type { TranscriptDoc } from 'samwell-shared';
import { describe, expect, it } from 'vitest';

import { followLines, LINE_MAX_CHARS, splitLines } from '@/features/podcasts/utils/transcript-lines';

// The opening of a real Founders block: one speaker, 33 seconds, 619 characters.
const FOUNDERS =
  "So this episode's gonna be a little different. It's not on a book, but it's on this excellent long-form profile of Mark Zuckerberg that my friend Jeremy Stern wrote. The name of the profile, the title of the profile is called Mark, and the subtitle is A Journey to the Heart of History's Largest Non-Territorial Empire. And the piece opens with Jeremy interviewing Mark Zuckerberg's parents. And he says, \"There they are, the Zuckerbergs. They look you in the eye, and they don't break contact. His dad is a ham. His mother is shy. I don't know what I expected them to be like, but for whatever reason, this wasn't it.\"";

describe('splitLines', () => {
  it('cuts a block into its sentences, each keeping where it starts', () => {
    const lines = splitLines('First one is here. Second one follows it! Third, asked of you?');
    expect(lines.map((l) => l.text)).toEqual(['First one is here.', 'Second one follows it!', 'Third, asked of you?']);
    expect(lines.map((l) => l.from)).toEqual([0, 19, 42]);
  });

  it('joins a stray short sentence to the next, and the last to the one before', () => {
    expect(splitLines('Right. So the company was founded in Ohio. Yeah.').map((l) => l.text)).toEqual([
      'Right. So the company was founded in Ohio. Yeah.',
    ]);
    expect(splitLines('His dad is a ham. Okay. His mother is shy.').map((l) => l.text)).toEqual([
      'His dad is a ham.',
      'Okay. His mother is shy.',
    ]);
  });

  it('does not end a sentence at a title, an initial or a lower-case word', () => {
    expect(splitLines('Then Mr. Smith met J. K. Rowling at the door. She said hello to him.').map((l) => l.text)).toEqual([
      'Then Mr. Smith met J. K. Rowling at the door.',
      'She said hello to him.',
    ]);
    expect(splitLines('It cost 3.5 million, i.e. a lot of money for them.')).toHaveLength(1);
  });

  it('keeps a closing quote with its sentence', () => {
    expect(splitLines('He said, "Carthage must be destroyed." And the hall went quiet after.').map((l) => l.text)).toEqual([
      'He said, "Carthage must be destroyed."',
      'And the hall went quiet after.',
    ]);
  });

  it('halves a long sentence at the clause nearest its middle, never leaving a scrap', () => {
    const lines = splitLines(FOUNDERS);
    expect(lines.every((l) => l.text.length <= LINE_MAX_CHARS)).toBe(true);
    expect(lines.every((l) => l.text.length >= 10)).toBe(true);
    expect(lines.map((l) => l.text).join(' ')).toBe(FOUNDERS);
    for (const line of lines) expect(FOUNDERS.slice(line.from, line.from + line.text.length)).toBe(line.text);
  });

  it('cuts at a space when a long sentence has no clause to cut at', () => {
    const run = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
    const lines = splitLines(run);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.map((l) => l.text).join(' ')).toBe(run);
  });

  it('gives nothing for nothing', () => {
    expect(splitLines('   ')).toEqual([]);
  });
});

describe('followLines', () => {
  const doc: TranscriptDoc = {
    version: 1,
    source: 'scribe',
    language: 'en',
    durationSec: 60,
    speakers: ['David Senra', 'Speaker 2'],
    segments: [
      { start: 0, end: 20, speaker: 0, text: 'The first half is this one. The second half is this one.' },
      { start: 20, end: 30, speaker: 0, text: 'He carries on talking for a while.' },
      { start: 30, end: 40, speaker: 1, text: 'And then a guest answers him.' },
    ],
  };

  it('times each line by how far into its block it starts', () => {
    const lines = followLines(doc);
    expect(lines.map((l) => l.text)).toEqual([
      'The first half is this one.',
      'The second half is this one.',
      'He carries on talking for a while.',
      'And then a guest answers him.',
    ]);
    expect(lines[1].start).toBeCloseTo((20 * 28) / 56);
    expect(lines.map((l) => l.time)).toEqual(['0:00', '0:10', '0:20', '0:30']);
    expect(lines.map((l) => l.segment)).toEqual([0, 0, 1, 2]);
    expect(lines.map((l) => l.index)).toEqual([0, 1, 2, 3]);
  });

  it('carries a sentence a block cut in two across into the next block', () => {
    const cut: TranscriptDoc = {
      ...doc,
      segments: [
        { start: 0, end: 40, speaker: 0, text: 'He absented himself from the sessions during the Cuban' },
        { start: 40, end: 60, speaker: 0, text: 'Missile Crisis. Then he went home to his family.' },
      ],
    };
    const lines = followLines(cut);
    expect(lines.map((l) => l.text)).toEqual([
      'He absented himself from the sessions during the Cuban Missile Crisis.',
      'Then he went home to his family.',
    ]);
    expect(lines.map((l) => l.segment)).toEqual([0, 1]);
    expect(lines[1].start).toBeCloseTo(40 + (20 * 16) / 48);
  });

  it('names a speaker where their turn begins, the first line included', () => {
    expect(followLines(doc).map((l) => l.heading)).toEqual(['David Senra', null, null, 'Speaker 2']);
  });

  it('draws no times and no names where the transcript has none', () => {
    const plain: TranscriptDoc = {
      ...doc,
      speakers: [],
      segments: doc.segments.map((s) => ({ ...s, start: 0, end: 0, speaker: null })),
    };
    const lines = followLines(plain);
    expect(lines.every((l) => l.time === null && l.heading === null && l.start === 0)).toBe(true);
  });
});
