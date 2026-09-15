import { describe, expect, it } from 'vitest';

import { normalizeTags } from 'samwell-shared';

describe('normalizeTags', () => {
  it('parses a comma-separated string from the local model', () => {
    expect(normalizeTags('Resilience, Founder Mindset, grit')).toEqual([
      'resilience',
      'founder mindset',
      'grit',
    ]);
  });

  it('strips leading # and surrounding punctuation', () => {
    expect(normalizeTags(['#resilience', '  grit.', '"focus"'])).toEqual([
      'resilience',
      'grit',
      'focus',
    ]);
  });

  it('dedupes case-insensitively and caps at 3', () => {
    expect(normalizeTags(['Focus', 'focus', 'grit', 'resilience', 'drive'])).toEqual([
      'focus',
      'grit',
      'resilience',
    ]);
  });

  it('drops empties, over-long tags, and phrases over three words', () => {
    expect(
      normalizeTags(['', '  ', 'a', 'this tag has four words', 'valid tag']),
    ).toEqual(['valid tag']);
  });

  it('splits newline and semicolon separated model output', () => {
    expect(normalizeTags('resilience\ngrit; focus')).toEqual(['resilience', 'grit', 'focus']);
  });
});
