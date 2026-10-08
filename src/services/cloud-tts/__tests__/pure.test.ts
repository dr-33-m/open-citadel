import { describe, expect, it } from 'vitest';

import { pieceCacheKey } from '@/services/cloud-tts/cache-key';
import { Lookahead } from '@/services/cloud-tts/lookahead';
import { PcmDecoder, floatBytes } from '@/services/cloud-tts/pcm';
import { cutPieces } from '@/services/cloud-tts/pieces';
import { normaliseUtterance, splitSentences } from '@/services/cloud-tts/sentences';

function s16(...values: number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 2);
  const view = new DataView(bytes.buffer);
  values.forEach((v, i) => view.setInt16(i * 2, v, true));
  return bytes;
}

describe('PcmDecoder', () => {
  it('turns s16le into Float32 in [-1, 1)', () => {
    const out = new PcmDecoder().push(s16(0, 16384, -32768, 32767));
    expect(Array.from(out)).toEqual([0, 0.5, -1, 32767 / 32768]);
  });

  it('keeps a half sample across chunks instead of shifting every byte after it', () => {
    const decoder = new PcmDecoder();
    const whole = s16(1000, -2000, 3000);
    const first = decoder.push(whole.slice(0, 3));
    expect(first.length).toBe(1);
    expect(decoder.pending).toBe(1);
    const second = decoder.push(whole.slice(3));
    expect(Array.from([...first, ...second])).toEqual([1000, -2000, 3000].map((v) => v / 32768));
    expect(decoder.pending).toBe(0);
  });

  it('folds stereo to mono', () => {
    const out = new PcmDecoder(2).push(s16(1000, 3000, -1000, -3000));
    expect(Array.from(out)).toEqual([2000 / 32768, -2000 / 32768]);
  });

  it('hands over exactly the bytes of a view', () => {
    const backing = new Float32Array([1, 2, 3, 4]);
    expect(floatBytes(backing.subarray(1, 3)).byteLength).toBe(8);
    expect(Array.from(new Float32Array(floatBytes(backing.subarray(1, 3))))).toEqual([2, 3]);
  });
});

describe('cutPieces', () => {
  it('leaves an ordinary sentence whole', () => {
    expect(cutPieces('It was a quiet evening.', 1500)).toEqual(['It was a quiet evening.']);
  });

  it('cuts a run-on sentence at clause ends, under the limit, losing nothing', () => {
    const clause = 'and the river went on past the mill, ';
    const text = `It began ${clause.repeat(60)}until night.`;
    const pieces = cutPieces(text, 300);
    expect(pieces.length).toBeGreaterThan(1);
    for (const piece of pieces) expect(piece.length).toBeLessThanOrEqual(300);
    for (const piece of pieces.slice(0, -1)) expect(piece.endsWith(',')).toBe(true);
    expect(pieces.join(' ').replace(/\s+/g, ' ')).toBe(text.replace(/\s+/g, ' '));
  });

  it('falls back to a space, and only then to the middle of a word', () => {
    expect(cutPieces('aaaa bbbb cccc', 9)).toEqual(['aaaa bbbb', 'cccc']);
    expect(cutPieces('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
  });
});

describe('splitSentences', () => {
  it('breaks after end punctuation and closing quotes', () => {
    expect(splitSentences('She stopped. "Who is there?" he said. Nobody answered!')).toEqual([
      'She stopped.',
      '"Who is there?" he said.',
      'Nobody answered!',
    ]);
  });

  it('does not break before a lower-case word', () => {
    expect(splitSentences('Take e.g. this one. And that.')).toEqual(['Take e.g. this one.', 'And that.']);
  });

  it('keeps an unfinished tail', () => {
    expect(splitSentences('One. Two without an end')).toEqual(['One.', 'Two without an end']);
    expect(splitSentences('   ')).toEqual([]);
  });

  it('matches text however it was spaced or quoted', () => {
    expect(normaliseUtterance('“Hello,”  she said.')).toBe(normaliseUtterance('"Hello," she said.'));
    expect(normaliseUtterance('Hello.')).not.toBe(normaliseUtterance('Goodbye.'));
  });
});

describe('Lookahead', () => {
  it('guesses the next two sentences from the rest of the paragraph', () => {
    expect(new Lookahead().predict('Two. Three. Four.')).toEqual(['Two.', 'Three.']);
    expect(new Lookahead().predict(null)).toEqual([]);
  });

  it('stops guessing for the session when most guesses are never asked for', () => {
    const lookahead = new Lookahead();
    for (let i = 0; i < 6; i++) lookahead.predict(`Guess ${i}a. Guess ${i}b.`);
    for (let i = 0; i < 4; i++) lookahead.recordRequest(`Something else ${i}.`);
    expect(lookahead.active).toBe(false);
    expect(lookahead.predict('More. Text.')).toEqual([]);
  });

  it('keeps guessing while the guesses are being asked for', () => {
    const lookahead = new Lookahead();
    for (let i = 0; i < 10; i++) {
      lookahead.predict(`Sentence ${i + 1}. Sentence ${i + 2}.`);
      expect(lookahead.recordRequest(`Sentence ${i + 1}.`)).toBe(true);
    }
    expect(lookahead.active).toBe(true);
  });
});

describe('pieceCacheKey', () => {
  const base = { bookId: 'b1', modelId: 'hexgrad/kokoro-82m', voice: 'af_heart', speed: null, text: 'It was late.' };

  it('is the same for the same piece, however it was spaced', () => {
    expect(pieceCacheKey(base)).toBe(pieceCacheKey({ ...base, text: ' It  was late. ' }));
  });

  it('differs by book, voice, model, speed and words', () => {
    const key = pieceCacheKey(base);
    expect(pieceCacheKey({ ...base, bookId: 'b2' })).not.toBe(key);
    expect(pieceCacheKey({ ...base, voice: 'am_adam' })).not.toBe(key);
    expect(pieceCacheKey({ ...base, modelId: 'x/y' })).not.toBe(key);
    expect(pieceCacheKey({ ...base, speed: 1.25 })).not.toBe(key);
    expect(pieceCacheKey({ ...base, text: 'It was early.' })).not.toBe(key);
    expect(key).toMatch(/^[a-z0-9-]+$/);
  });
});
