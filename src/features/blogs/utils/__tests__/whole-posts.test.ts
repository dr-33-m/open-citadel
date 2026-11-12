import { describe, expect, it } from 'vitest';

import { possessive, wholePostsAsk, wholePostsLine } from '@/features/blogs/utils/whole-posts';

describe('wholePostsLine', () => {
  it('says what the reader chose, and that it can be changed', () => {
    expect(wholePostsLine({ mode: null, allowed: true, host: 'aeon.co' })).toEqual({ text: 'Previews only. Choose where posts open', canChange: true, mark: 'reader' });
    expect(wholePostsLine({ mode: 'site', allowed: true, host: 'aeon.co' }).mark).toBe('site');
    expect(wholePostsLine({ mode: 'site', allowed: true, host: 'aeon.co' }).text).toBe('Posts open on aeon.co');
    expect(wholePostsLine({ mode: 'app', allowed: true, host: 'aeon.co' }).text).toBe('Posts open in the reader');
  });

  it("puts the publisher's ask above the reader's choice, with nothing to change", () => {
    expect(wholePostsLine({ mode: 'app', allowed: false, host: 'aeon.co' })).toEqual({
      text: 'Posts open on aeon.co, as its publisher asks',
      canChange: false,
      mark: 'site',
    });
  });
});

describe('wholePostsAsk', () => {
  it('names the blog and its site, with no em dashes', () => {
    const copy = wholePostsAsk('Aeon', 'aeon.co');
    expect(copy.kicker).toBe('AEON');
    expect(copy.title).toBe("Where should Aeon's posts open?");
    expect(copy.line).toBe('Aeon only sends the first few lines of each post.');
    expect(copy.site.title).toBe('On aeon.co');
    expect(copy.app.detail).toContain('aeon.co');
    expect(JSON.stringify(copy)).not.toContain('—');
    expect(copy.note).toBe("Saved on this phone only. Change this on Aeon's page.");
    expect(wholePostsAsk('Aeon', 'aeon.co', true).note).toBe('Saved on this phone only.');
  });
});

describe('possessive', () => {
  it("adds 's, or only ' after a name that ends in s", () => {
    expect(possessive('Aeon')).toBe("Aeon's");
    expect(possessive('Paul Graham Essays')).toBe("Paul Graham Essays'");
  });
});
