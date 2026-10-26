import { describe, expect, it } from 'vitest';

import { articleMenu } from '@/features/blogs/utils/article-menu';
import { looksLikeAddress, searchDirectory } from '@/features/blogs/utils/explore';
import { articleMeta } from '@/features/blogs/utils/format';

describe('articleMenu', () => {
  const FRESH = { savedAt: null, favoritedAt: null, finishedAt: null, readAt: null };

  it('offers what a book offers, in the state the post is in', () => {
    const fresh = articleMenu(FRESH, { blogLink: true }).map((r) => r.key);
    expect(fresh).toEqual(['open', 'chat', 'favorite', 'queue', 'finish', 'read', 'original', 'share', 'blog']);
    const kept = articleMenu({ savedAt: 'x', favoritedAt: 'x', finishedAt: null, readAt: 'y' }, { blogLink: false }).map(
      (r) => r.key,
    );
    expect(kept).toEqual(['open', 'chat', 'unfavorite', 'dequeue', 'finish', 'unread', 'original', 'share']);
  });

  it('offers Listen after Read where it is offered, locked without a plan', () => {
    expect(articleMenu(FRESH, { blogLink: true, listen: 'open' }).map((r) => r.key).slice(0, 3)).toEqual(['open', 'listen', 'chat']);
    const locked = articleMenu(FRESH, { blogLink: true, listen: 'locked' })[1];
    expect(locked).toMatchObject({ key: 'listen-locked', label: 'Listen', tone: 'muted' });
    expect(articleMenu(FRESH, { blogLink: true, listen: null }).map((r) => r.key)).not.toContain('listen');
  });

  it('keeps a finished post off the queue', () => {
    const keys = articleMenu({ ...FRESH, finishedAt: 'x', readAt: 'x' }, { blogLink: false }).map((r) => r.key);
    expect(keys).not.toContain('queue');
    expect(keys).toContain('unfinish');
  });

  it('writes its labels without em dashes', () => {
    for (const row of articleMenu(FRESH, { blogLink: true })) {
      expect(row.label).not.toContain('—');
    }
  });
});

describe('looksLikeAddress', () => {
  it('knows an address from words', () => {
    expect(looksLikeAddress('fs.blog')).toBe(true);
    expect(looksLikeAddress('https://example.com/feed')).toBe(true);
    expect(looksLikeAddress('example.co.uk/blog/')).toBe(true);
    expect(looksLikeAddress('feed://example.com')).toBe(true);
    expect(looksLikeAddress('stoic philosophy')).toBe(false);
    expect(looksLikeAddress('stoicism')).toBe(false);
    expect(looksLikeAddress('')).toBe(false);
  });
});

describe('searchDirectory', () => {
  const blogs = [
    { title: 'Farnam Street', feedUrl: 'a', blurb: 'Mental models and clear thinking.' },
    { title: 'Daily Stoic', feedUrl: 'b', blurb: 'Stoic ideas for everyday life.' },
  ];

  it('matches names and what a blog is about', () => {
    expect(searchDirectory(blogs, 'farnam').map((b) => b.feedUrl)).toEqual(['a']);
    expect(searchDirectory(blogs, 'stoic').map((b) => b.feedUrl)).toEqual(['b']);
    expect(searchDirectory(blogs, '  ')).toEqual([]);
  });
});

describe('articleMeta', () => {
  const now = new Date(2026, 8, 27, 12);
  const article = { blogTitle: 'Farnam Street', publishedAt: new Date(2026, 8, 26, 9).toISOString() };

  it('names the blog in lists across blogs', () => {
    expect(articleMeta(article, true, now)).toBe('Farnam Street · Yesterday');
    expect(articleMeta(article, false, now)).toBe('Yesterday');
  });
});
