import { describe, expect, it } from 'vitest';

import { offsetOfText } from '@/features/audiobook/utils/text-offset';

const chapter = 'The interview was successful. I took care\nto explain that I did not know Pittsburgh.\n\nHe asked me how soon I could come.';

describe('offsetOfText', () => {
  it('finds where the page text begins in the chapter', () => {
    expect(offsetOfText(chapter, 'I took care to explain that I did not know', 0)).toBe(chapter.indexOf('I took care'));
  });

  it('does not hold the page laying out whitespace its own way against it', () => {
    expect(offsetOfText(chapter, '  to explain   that I did\nnot know Pittsburgh.  He asked', 0)).toBe(chapter.indexOf('to explain'));
  });

  it('ignores soft hyphens the page breaks words with', () => {
    expect(offsetOfText(chapter, 'Pitts­burgh. He asked me how soon', 0)).toBe(chapter.indexOf('Pittsburgh'));
  });

  it('takes the place nearest the estimate when the text occurs more than once', () => {
    const twice = 'He said nothing at all that day. Between them. He said nothing at all that day.';
    const second = twice.lastIndexOf('He said');
    expect(offsetOfText(twice, 'He said nothing at all that day.', second - 3)).toBe(second);
    expect(offsetOfText(twice, 'He said nothing at all that day.', 0)).toBe(0);
  });

  it('answers null for text that is not there or too short to go by', () => {
    expect(offsetOfText(chapter, 'Nothing like this is in the chapter at all', 0)).toBeNull();
    expect(offsetOfText(chapter, 'I took', 0)).toBeNull();
  });
});
