import { describe, expect, it } from 'vitest';

import { base64ToBytes, bytesToBase64, utf8Decode } from '@/utils/bytes';

describe('base64', () => {
  it('round-trips every length of tail', () => {
    for (const text of ['', 'a', 'ab', 'abc', 'abcd', 'any carnal pleasure.']) {
      const bytes = new Uint8Array(Buffer.from(text));
      const base64 = bytesToBase64(bytes);
      expect(base64).toBe(Buffer.from(text).toString('base64'));
      expect(Array.from(base64ToBytes(base64))).toEqual(Array.from(bytes));
    }
  });

  it('round-trips binary and skips whitespace', () => {
    const bytes = new Uint8Array(20_000).map((_, i) => (i * 37) % 256);
    const base64 = Buffer.from(bytes).toString('base64');
    expect(bytesToBase64(bytes)).toBe(base64);
    expect(Array.from(base64ToBytes(`${base64.slice(0, 10)}\n${base64.slice(10)}`))).toEqual(Array.from(bytes));
  });
});

describe('utf8Decode', () => {
  it('reads multi-byte characters and drops a byte-order mark', () => {
    const text = 'Café · Ελληνικά · 日本 · 🙂';
    expect(utf8Decode(new Uint8Array(Buffer.from(text)))).toBe(text);
    expect(utf8Decode(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]))).toBe('A');
  });

  it('reads text longer than one buffer, with a pair split across the edge', () => {
    for (const lead of [8190, 8191, 8192]) {
      const text = `${'a'.repeat(lead)}🙂é${'日本'.repeat(5000)}`;
      expect(utf8Decode(new Uint8Array(Buffer.from(text)))).toBe(text);
    }
  });

  it('puts a replacement character where a sequence is broken', () => {
    expect(utf8Decode(new Uint8Array([0x41, 0xff, 0x42]))).toBe('A�B');
  });
});
