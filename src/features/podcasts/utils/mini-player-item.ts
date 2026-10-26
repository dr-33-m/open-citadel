/**
 * What the mini player draws for whatever is in the player: an episode with
 * its show under it and square artwork, or a book with the chapter being
 * heard under it and its cover standing as a book does (a blog post's picture
 * square, `coverAspect`).
 *
 * Pure, so it can be tested on its own.
 */
import type { NowPlaying } from '@/stores/player';
import { coverAspect } from '@/utils/cover-aspect';

export interface MiniPlayerItem {
  kind: NowPlaying['kind'];
  /** What the artwork stands for when there is none: a book, a post or an episode. */
  art: 'book' | 'post' | 'episode';
  title: string;
  subtitle: string;
  artworkUrl: string | null;
  /** Width over height. */
  aspect: number;
  positionSec: number;
  durationSec: number;
}

export function miniPlayerItem(current: NowPlaying): MiniPlayerItem {
  if (current.kind === 'book') {
    return {
      kind: 'book',
      art: current.post ? 'post' : 'book',
      title: current.title,
      subtitle: current.chapterTitle ?? current.author ?? '',
      artworkUrl: current.coverUrl,
      aspect: coverAspect(current.post),
      positionSec: current.positionSec,
      durationSec: current.durationSec,
    };
  }
  return {
    kind: 'episode',
    art: 'episode',
    title: current.title,
    subtitle: current.showTitle,
    artworkUrl: current.artworkUrl,
    aspect: 1,
    positionSec: current.positionSec,
    durationSec: current.durationSec,
  };
}
