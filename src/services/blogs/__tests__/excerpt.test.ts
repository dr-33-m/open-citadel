import { describe, expect, it } from 'vitest';

import { feedExcerpt, isTeaser, storedExcerpt } from '@/services/blogs/feed/excerpt';

const LONG = Array.from({ length: 12 }, (_, i) => `<p>Paragraph ${i} ${'of careful, considered prose '.repeat(8)}</p>`).join('');
const SHORT_POST = '<p>The creepiness fades.</p><p>But at the same time, a creeping change sets in.</p>';

describe('feedExcerpt', () => {
  it('takes a cut-off copy for an opening, whatever its length', () => {
    expect(feedExcerpt({ content: `${LONG}<p>Continue reading →</p>`, description: null })).toBe(true);
    expect(feedExcerpt({ content: '<p>One of the biggest&#8230;</p><p><a href="x">Source</a></p>', description: 'A line.' })).toBe(true);
  });

  it('takes a short description with no body for a summary', () => {
    expect(feedExcerpt({ content: null, description: 'Is self-enclosure life’s greatest trick?' })).toBe(true);
    expect(feedExcerpt({ content: null, description: null })).toBe(true);
  });

  it('takes a body that only repeats its summary for a summary', () => {
    const blurb = '<p>A neopagan visual archive meant to rival the iconic power of the West.</p>';
    expect(feedExcerpt({ content: blurb, description: 'A neopagan visual archive meant to rival the iconic power of the West.' })).toBe(true);
  });

  it('takes a short post the feed carries whole for the post', () => {
    expect(feedExcerpt({ content: SHORT_POST, description: 'The uncanny valley is where an image creeps us out' })).toBe(false);
    expect(feedExcerpt({ content: SHORT_POST, description: null })).toBe(false);
  });

  it('takes a long copy for the post, with or without a body tag', () => {
    expect(feedExcerpt({ content: LONG, description: 'A summary.' })).toBe(false);
    expect(feedExcerpt({ content: null, description: LONG })).toBe(false);
  });
});

describe('isTeaser, the guess for posts stored before', () => {
  it('treats a short or cut-off copy as a teaser, and a long one as the post', () => {
    expect(isTeaser(null)).toBe(true);
    expect(isTeaser('<p>Just the first paragraph.</p>')).toBe(true);
    expect(isTeaser(`${LONG}<p>and so it goes [&#8230;]</p>`)).toBe(true);
    expect(isTeaser(LONG)).toBe(false);
  });
});

describe('storedExcerpt, for a post stored before the feed was asked', () => {
  it("goes by the blog's newer posts when they agree", () => {
    expect(storedExcerpt([false, false], '<p>A short, whole post.</p>')).toBe(false);
    expect(storedExcerpt([true, true], LONG)).toBe(true);
  });

  it('falls back on the copy itself when nothing is known or the blog is mixed', () => {
    expect(storedExcerpt([], '<p>Short.</p>')).toBe(true);
    expect(storedExcerpt([true, false], LONG)).toBe(false);
  });
});
