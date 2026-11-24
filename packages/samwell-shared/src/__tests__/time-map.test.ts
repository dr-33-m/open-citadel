import { describe, expect, it } from 'vitest';

import { audioIdentity, TimeMapAnswerSchema, toAudioTime, toTranscriptTime, type TimeMap } from '../time-map';

// The transcribed copy opened with a 30s ad and had a 60s one at 10:00 of the
// show; the copy being played has neither.
const fewerAds: TimeMap = [
  { audioStart: 0, audioEnd: 600, transcriptStart: 30 },
  { audioStart: 600, audioEnd: 2_000, transcriptStart: 690 },
];

// The copy being played has a 20s ad of its own at 5:00.
const moreAds: TimeMap = [
  { audioStart: 0, audioEnd: 300, transcriptStart: 0 },
  { audioStart: 320, audioEnd: 2_000, transcriptStart: 300 },
];

describe('toAudioTime', () => {
  it('moves a moment of the transcript to where it is heard', () => {
    expect(toAudioTime(fewerAds, 40)).toBe(10);
    expect(toAudioTime(fewerAds, 700)).toBe(610);
    expect(toAudioTime(moreAds, 400)).toBe(420);
  });

  it('sends a moment the playing copy does not have to where the show picks up', () => {
    // 0:05 of the transcript is inside the ad this copy does not carry.
    expect(toAudioTime(fewerAds, 5)).toBe(0);
    expect(toAudioTime(fewerAds, 650)).toBe(600);
  });

  it('carries on past the last stretch, and leaves a time alone with no map', () => {
    expect(toAudioTime(fewerAds, 2_200)).toBe(2_000 + (2_200 - 2_090));
    expect(toAudioTime([], 123)).toBe(123);
  });
});

describe('toTranscriptTime', () => {
  it('says which moment of the transcript is being heard', () => {
    expect(toTranscriptTime(fewerAds, 10)).toBe(40);
    expect(toTranscriptTime(moreAds, 420)).toBe(400);
  });

  it('is null inside an ad the transcript does not have', () => {
    expect(toTranscriptTime(moreAds, 310)).toBeNull();
  });

  it('is the time itself with no map', () => {
    expect(toTranscriptTime([], 42)).toBe(42);
  });
});

describe('audioIdentity', () => {
  it('names a copy by its address and length, without the query that changes on every request', () => {
    expect(audioIdentity('https://cdn.example.com/a.mp3?session=1&t=2', 100)).toBe('https://cdn.example.com/a.mp3|100');
    expect(audioIdentity('https://cdn.example.com/a.mp3?session=9', 100)).toBe(audioIdentity('https://cdn.example.com/a.mp3', 100));
    expect(audioIdentity('https://cdn.example.com/a.mp3', 101)).not.toBe(audioIdentity('https://cdn.example.com/a.mp3', 100));
  });
});

describe('TimeMapAnswerSchema', () => {
  it('takes stretches that run forwards, and refuses one that does not', () => {
    expect(TimeMapAnswerSchema.safeParse({ segments: [{ audioStart: 0, audioEnd: 10, transcriptStart: 3 }] }).success).toBe(true);
    expect(TimeMapAnswerSchema.safeParse({ segments: [{ audioStart: 10, audioEnd: 10, transcriptStart: 3 }] }).success).toBe(false);
    expect(TimeMapAnswerSchema.safeParse({ segments: [{ audioStart: 0 }] }).success).toBe(false);
  });
});
