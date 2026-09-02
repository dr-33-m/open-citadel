import { describe, expect, it } from 'vitest';

import { readJsonStringField } from '../partial-json';

/** Every prefix of `raw`, which is what the stream actually hands over. */
function prefixes(raw: string): string[] {
  return Array.from({ length: raw.length + 1 }, (_unused, i) => raw.slice(0, i));
}

describe('readJsonStringField', () => {
  it('returns null before the field has been reached', () => {
    expect(readJsonStringField('', 'reply')).toBeNull();
    expect(readJsonStringField('{', 'reply')).toBeNull();
    expect(readJsonStringField('{"rep', 'reply')).toBeNull();
    expect(readJsonStringField('{"reply"', 'reply')).toBeNull();
  });

  it('reports an empty, open value once the colon has landed', () => {
    expect(readJsonStringField('{"reply": ', 'reply')).toEqual({ value: '', closed: false });
  });

  it('grows the value as the string arrives', () => {
    expect(readJsonStringField('{"reply":"Hel', 'reply')).toEqual({ value: 'Hel', closed: false });
    expect(readJsonStringField('{"reply":"Hello', 'reply')).toEqual({
      value: 'Hello',
      closed: false,
    });
  });

  it('closes on the closing quote', () => {
    expect(readJsonStringField('{"reply":"Hello"', 'reply')).toEqual({
      value: 'Hello',
      closed: true,
    });
  });

  it('never shrinks or rewrites what it has already reported', () => {
    const raw = '{"reply":"Line one.\\nLine two, with a \\"quote\\" in it.","draft":null}';
    let last = '';
    for (const prefix of prefixes(raw)) {
      const read = readJsonStringField(prefix, 'reply');
      if (!read) continue;
      expect(read.value.startsWith(last) || last.startsWith(read.value)).toBe(true);
      expect(read.value.length).toBeGreaterThanOrEqual(last.length);
      last = read.value;
    }
    expect(last).toBe('Line one.\nLine two, with a "quote" in it.');
  });

  it('resolves escapes', () => {
    expect(readJsonStringField('{"reply":"a\\nb\\tc\\\\d\\"e"', 'reply')?.value).toBe(
      'a\nb\tc\\d"e',
    );
  });

  it('holds back an escape that has not fully arrived', () => {
    expect(readJsonStringField('{"reply":"ab\\', 'reply')).toEqual({ value: 'ab', closed: false });
    expect(readJsonStringField('{"reply":"ab\\u201', 'reply')).toEqual({
      value: 'ab',
      closed: false,
    });
    expect(readJsonStringField('{"reply":"ab\\u2019', 'reply')).toEqual({
      value: 'ab’',
      closed: false,
    });
  });

  it('is not fooled by braces or quotes inside the value', () => {
    const raw = '{"reply":"He said {\\"go\\"} and left","draft":null}';
    expect(readJsonStringField(raw, 'reply')).toEqual({
      value: 'He said {"go"} and left',
      closed: true,
    });
  });

  it('ignores a key of the same name nested inside another object', () => {
    const raw = '{"draft":{"reply":"not this"},"reply":"this one"}';
    expect(readJsonStringField(raw, 'reply')).toEqual({ value: 'this one', closed: true });
  });

  it('returns null for a field that is not a string', () => {
    expect(readJsonStringField('{"draft":null,"reply":"hi"}', 'draft')).toBeNull();
    expect(readJsonStringField('{"count":42}', 'count')).toBeNull();
  });

  it('reads a field that arrives after another one', () => {
    expect(readJsonStringField('{"draft":null,"reply":"second"}', 'reply')).toEqual({
      value: 'second',
      closed: true,
    });
  });

  it('tolerates whitespace around the colon', () => {
    expect(readJsonStringField('{\n  "reply"  :  "spaced"\n}', 'reply')).toEqual({
      value: 'spaced',
      closed: true,
    });
  });
});
