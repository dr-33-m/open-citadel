import { describe, expect, it } from 'vitest';

import {
    TRANSCRIPTION_MODEL,
    TranscriptDocSchema,
    joinTimed,
    joinWords,
    mergeTimedText,
    UNKNOWN_DURATION_SECONDS,
    transcriptionCostUsd,
    transcriptionCredits,
    transcriptionSeconds,
} from '../transcripts';

describe('transcriptionCredits', () => {
  it('is nothing for nothing', () => {
    expect(transcriptionCredits(0)).toBe(0);
    expect(transcriptionCredits(-5)).toBe(0);
    expect(transcriptionCredits(Number.NaN)).toBe(0);
  });

  it('rounds a single second up to one Neuron', () => {
    expect(transcriptionCredits(1)).toBe(1);
  });

  it('prices an hour, just short, at the live rate', () => {
    // 3,599 s at $61.11 per million seconds is $0.21994, at $0.0008 a Neuron 274.9.
    expect(transcriptionCredits(3_599)).toBe(275);
    expect(transcriptionCredits(5_400)).toBe(413);
  });

  it('prices four hours, the longest episode taken', () => {
    expect(transcriptionCredits(14_400)).toBe(1_100);
  });

  it('agrees with the real charge of the spike episode', () => {
    // 912.93 s cost $0.05579 on OpenRouter on 2026-10-19.
    expect(transcriptionCostUsd(912.927375)).toBeCloseTo(0.05579, 5);
  });

  it('reads a missing length as two hours', () => {
    expect(transcriptionSeconds(0)).toBe(UNKNOWN_DURATION_SECONDS);
    expect(transcriptionSeconds(1_800)).toBe(1_800);
  });

  it('is gated at the cheapest plan', () => {
    expect(TRANSCRIPTION_MODEL.minPlan).toBe('maester');
  });
});

describe('TranscriptDocSchema', () => {
  it('takes a speaker index or none', () => {
    const doc = {
      version: 1,
      source: 'feed',
      language: null,
      durationSec: 10,
      speakers: ['Lex Fridman'],
      segments: [
        { start: 0, end: 4, speaker: 0, text: 'Hello.' },
        { start: 4, end: 10, speaker: null, text: 'Music.' },
      ],
    };
    expect(TranscriptDocSchema.parse(doc)).toEqual(doc);
    expect(() => TranscriptDocSchema.parse({ ...doc, version: 2 })).toThrow();
  });
});

describe('joinTimed', () => {
  it('starts each word at the piece it begins in, punctuation joining the word before', () => {
    const { text, starts } = joinTimed([
      { text: 'Hello', start: 1, end: 1.4 },
      { text: ',', start: 1.4, end: 1.4 },
      { text: 'world', start: 2, end: 2.5 },
      { text: '.', start: 2.5, end: 2.5 },
    ]);
    expect(text).toBe('Hello, world.');
    expect(starts).toEqual([1, 2]);
  });

  it('places a word inside a phrase as far through its time as through its text', () => {
    const { text, starts } = joinTimed([{ text: 'one two', start: 10, end: 17 }]);
    expect(text).toBe('one two');
    expect(starts[0]).toBe(10);
    expect(starts[1]).toBeCloseTo(14);
  });

  it('joins words as joinWords always has', () => {
    expect(joinWords(['Hello', ',', 'world', '.'])).toBe('Hello, world.');
    expect(joinWords([' Hello', ' world.', '  '])).toBe('Hello world.');
  });
});

describe('mergeTimedText', () => {
  it('keeps when each word of a block starts, in hundredths after the block', () => {
    const [block] = mergeTimedText([
      { text: 'Slowly', start: 5, end: 5.5, speaker: 0 },
      { text: 'said.', start: 5.6, end: 6, speaker: 0 },
      { text: 'Then', start: 9.25, end: 9.5, speaker: 0 },
    ]);
    expect(block.text).toBe('Slowly said. Then');
    expect(block.words).toEqual([0, 60, 425]);
  });

  it('keeps no word times for a transcript without times', () => {
    const [block] = mergeTimedText([{ text: 'No times here.', start: 0, end: 0, speaker: null }]);
    expect(block.words).toBeUndefined();
  });

  it('accepts a transcript with or without word times', () => {
    const doc = { version: 1, source: 'scribe', language: 'en', durationSec: 10, speakers: [], segments: [] };
    const segment = { start: 0, end: 2, speaker: null, text: 'Two words' };
    expect(TranscriptDocSchema.safeParse({ ...doc, segments: [segment] }).success).toBe(true);
    expect(TranscriptDocSchema.safeParse({ ...doc, segments: [{ ...segment, words: [0, 100] }] }).success).toBe(true);
  });
});
