import { describe, expect, it } from 'vitest';

import { articleRoute, type ArticleRouteInput } from '@/services/blogs/article-route';

const base: ArticleRouteInput = { purpose: 'read', excerpt: true, copy: null, wholePosts: null, allowed: true };

describe('articleRoute', () => {
  it('reads a whole post from the feed, and a copy already made from the phone', () => {
    expect(articleRoute({ ...base, excerpt: false })).toBe('feed');
    expect(articleRoute({ ...base, copy: 'whole' })).toBe('copy');
    expect(articleRoute({ ...base, copy: 'whole', allowed: false })).toBe('copy');
  });

  it('asks once how a summary-only blog is read, then keeps to the answer', () => {
    expect(articleRoute(base)).toBe('ask');
    expect(articleRoute({ ...base, wholePosts: 'site' })).toBe('site');
    expect(articleRoute({ ...base, wholePosts: 'app' })).toBe('page');
  });

  it('never fetches a page the publisher has said no to', () => {
    expect(articleRoute({ ...base, allowed: false })).toBe('site');
    expect(articleRoute({ ...base, allowed: false, wholePosts: 'app' })).toBe('site');
    expect(articleRoute({ ...base, purpose: 'chat', allowed: false, wholePosts: 'app' })).toBe('opening');
  });

  it('grounds a chat in the opening rather than fetching unasked', () => {
    expect(articleRoute({ ...base, purpose: 'chat' })).toBe('opening');
    expect(articleRoute({ ...base, purpose: 'chat', wholePosts: 'site' })).toBe('opening');
    expect(articleRoute({ ...base, purpose: 'chat', copy: 'opening' })).toBe('copy');
    expect(articleRoute({ ...base, purpose: 'chat', wholePosts: 'app' })).toBe('page');
  });

  it('replaces an opening with the whole post once whole posts are asked for', () => {
    expect(articleRoute({ ...base, copy: 'opening', wholePosts: 'app' })).toBe('page');
    expect(articleRoute({ ...base, copy: 'opening', wholePosts: 'site' })).toBe('site');
    expect(articleRoute({ ...base, copy: 'opening' })).toBe('ask');
  });
});
