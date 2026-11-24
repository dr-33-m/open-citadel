import { describe, expect, it } from 'vitest';
import type { TranscriptDoc } from 'samwell-shared';

import { placeOfWords, segmentWords } from '@/services/podcasts/transcript/highlight-locator';

const doc: TranscriptDoc = {
  version: 1,
  source: 'scribe',
  language: 'en',
  durationSec: 600,
  speakers: ['Neil', 'Aza'],
  segments: [
    { start: 30, end: 40, speaker: 0, text: 'Welcome to the show. Today we talk game theory.', words: [0, 50, 80, 110, 160, 210, 260, 300, 350] },
    { start: 120, end: 130, speaker: 1, text: 'Game theory is everywhere.', words: [0, 40, 90, 120] },
    { start: 400, end: 410, speaker: 1, text: 'Game theory is everywhere.' },
  ],
};

describe('placeOfWords', () => {
  it('finds the block that holds the words and the moment its first word is spoken', () => {
    expect(placeOfWords(doc, segmentWords(doc), 'Today we talk game theory.', null)).toEqual({ segment: 0, seconds: 30 + 1.6 });
  });

  it('matches however the words were spaced', () => {
    expect(placeOfWords(doc, segmentWords(doc), '  Today  we talk\ngame theory.', null)?.segment).toBe(0);
  });

  it('picks the time nearest the old moment when the words come twice', () => {
    expect(placeOfWords(doc, segmentWords(doc), 'Game theory is everywhere.', 390)).toEqual({ segment: 2, seconds: 400 });
    expect(placeOfWords(doc, segmentWords(doc), 'Game theory is everywhere.', 100)).toEqual({ segment: 1, seconds: 120 });
  });

  it('is null for words the new transcript does not have', () => {
    expect(placeOfWords(doc, segmentWords(doc), 'Something nobody said.', 100)).toBeNull();
  });
});
