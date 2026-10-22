/**
 * Where the audio is, worked out rather than asked: which chapter a position
 * falls in, and where the player has got to since it was last read. Pure, so
 * a surface can draw its first frame right without a round trip to the native
 * player.
 */

/** A chapter counts as started this long before its mark, so its title is up as it begins. */
const CHAPTER_LEAD_SEC = 0.5;

/**
 * The index of the chapter playing at `positionSec`, or -1 before the first.
 * `chapters` is in start order, as it is stored.
 */
export function chapterIndexAt(chapters: readonly { startSec: number }[], positionSec: number): number {
  let found = -1;
  for (let i = 0; i < chapters.length; i += 1) {
    if (chapters[i].startSec <= positionSec + CHAPTER_LEAD_SEC) found = i;
    else break;
  }
  return found;
}

/** One reading of the native player, and how fast the audio was moving when it was taken. */
export type PositionRead = {
  /** The episode, or the book, the reading is of. */
  itemId: string;
  position: number;
  duration: number;
  /** `Date.now()` when it was read. */
  at: number;
  /** Seconds of audio per second: the playback speed while playing, 0 while paused. */
  rate: number;
};

/**
 * Where the audio is by `now`, going by the last reading: it has carried on at
 * the reading's rate since, and no further than the episode's end.
 */
export function positionSince(read: PositionRead, now: number): number {
  const moved = (Math.max(0, now - read.at) / 1000) * read.rate;
  const position = read.position + moved;
  return read.duration > 0 ? Math.min(position, read.duration) : position;
}
