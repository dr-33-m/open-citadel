import { describe, expect, it } from 'vitest';

import { HARD_CUT_SECONDS, joinWords, shapeScribeReply, type ScribeWord } from '../transcript-shape.js';

const w = (word: string, start: number, speaker: string | null = 'speaker_0', end = start + 0.4): ScribeWord => ({
  word,
  start,
  end,
  ...(speaker ? { speaker_label: speaker } : {}),
  type: 'word',
});

describe('joinWords', () => {
  it('spaces words and keeps punctuation tight', () => {
    expect(joinWords(['Hello', ',', 'world', '.'])).toBe('Hello, world.');
    expect(joinWords([' Hello', ' world.'])).toBe('Hello world.');
  });
});

describe('shapeScribeReply', () => {
  it('starts a new block when the speaker changes, numbered by first to speak', () => {
    const { doc, labels } = shapeScribeReply({
      words: [w('Hi', 0, 'speaker_1'), w('there.', 0.5, 'speaker_1'), w('Hello.', 1, 'speaker_0'), w('Again.', 2, 'speaker_1')],
      duration: 3,
    });
    expect(labels).toEqual(['speaker_1', 'speaker_0']);
    expect(doc.speakers).toEqual(['Speaker 1', 'Speaker 2']);
    expect(doc.segments.map((s) => [s.speaker, s.text])).toEqual([
      [0, 'Hi there.'],
      [1, 'Hello.'],
      [0, 'Again.'],
    ]);
    expect(doc.durationSec).toBe(3);
  });

  it('cuts a long run at a sentence end after half a minute', () => {
    const words: ScribeWord[] = [];
    for (let t = 0; t < 34; t += 1) words.push(w(t === 31 ? 'end.' : 'word', t));
    words.push(w('Next', 34), w('one.', 35));
    const { doc } = shapeScribeReply({ words });
    expect(doc.segments).toHaveLength(2);
    expect(doc.segments[0].text.endsWith('end.')).toBe(true);
    expect(doc.segments[1].start).toBe(32);
  });

  it('cuts at forty seconds even without a sentence end', () => {
    const words: ScribeWord[] = [];
    for (let t = 0; t < 90; t += 1) words.push(w('and', t));
    const { doc } = shapeScribeReply({ words });
    for (const segment of doc.segments) expect(segment.end - segment.start).toBeLessThanOrEqual(HARD_CUT_SECONDS);
    expect(doc.segments.map((s) => s.start)).toEqual([0, 40, 80]);
  });

  it('accepts numeric speakers and words with no speaker at all', () => {
    const numeric = shapeScribeReply({ words: [{ word: 'One', start: 0, end: 1, speaker: 3 }] });
    expect(numeric.labels).toEqual(['3']);
    const none = shapeScribeReply({ words: [w('Solo', 0, null)] });
    expect(none.doc.speakers).toEqual([]);
    expect(none.doc.segments[0].speaker).toBeNull();
  });

  it('falls back to segments, then to plain text', () => {
    const fromSegments = shapeScribeReply({ segments: [{ start: 0, end: 4, text: ' Hello. ', speaker_label: 'A' }] });
    expect(fromSegments.doc.segments).toEqual([{ start: 0, end: 4, speaker: 0, text: 'Hello.' }]);
    const fromText = shapeScribeReply({ text: 'Just words.' }, 600);
    expect(fromText.doc.segments).toEqual([{ start: 0, end: 0, speaker: null, text: 'Just words.' }]);
    expect(fromText.doc.durationSec).toBe(600);
  });

  it('skips spacing tokens and blank words', () => {
    const { doc } = shapeScribeReply({ words: [w('A', 0), { word: ' ', start: 0.4, end: 0.5, type: 'spacing' }, w('', 1), w('B.', 1)] });
    expect(doc.segments[0].text).toBe('A B.');
  });
});
