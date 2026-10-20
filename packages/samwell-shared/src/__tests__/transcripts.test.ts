import { describe, expect, it } from 'vitest';

import {
    TRANSCRIPTION_MODEL,
    TranscriptDocSchema,
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
