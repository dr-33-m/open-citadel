import { describe, expect, it } from 'vitest';

import { miniPlayerItem } from '@/features/podcasts/utils/mini-player-item';

describe('miniPlayerItem', () => {
  it('draws an episode with its show and square artwork', () => {
    const item = miniPlayerItem({
      kind: 'episode',
      episodeId: 'e',
      podcastId: 'p',
      title: 'Ep',
      showTitle: 'Show',
      artworkUrl: 'a.jpg',
      durationSec: 60,
      positionSec: 5,
    });
    expect(item).toMatchObject({ kind: 'episode', subtitle: 'Show', aspect: 1, positionSec: 5 });
  });

  it('draws a book with the chapter being heard, falling back to its author', () => {
    const book = { kind: 'book' as const, bookId: 'b', title: 'Emma', author: 'Jane Austen', coverUrl: null, post: false, durationSec: 100, positionSec: 10 };
    expect(miniPlayerItem({ ...book, chapterTitle: 'Chapter 3' }).subtitle).toBe('Chapter 3');
    expect(miniPlayerItem({ ...book, chapterTitle: null }).subtitle).toBe('Jane Austen');
    expect(miniPlayerItem({ ...book, chapterTitle: null }).aspect).toBeCloseTo(2 / 3);
  });

  it('draws a blog post heard as a book square, with its own mark', () => {
    const post = { kind: 'book' as const, bookId: 'b', title: 'On Work', author: 'Paul, His Blog', coverUrl: null, post: true, chapterTitle: null, durationSec: 100, positionSec: 10 };
    expect(miniPlayerItem(post)).toMatchObject({ art: 'post', aspect: 1, subtitle: 'Paul, His Blog' });
  });
});
