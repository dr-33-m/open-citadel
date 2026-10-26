import TrackPlayer from '@rntp/player';
import React from 'react';
import { Easing, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { positionSince, type PositionRead } from '@/features/podcasts/utils/playback-position';
import { bookClockNow } from '@/services/audiobook';
import { heldPosition } from '@/utils/seek-hold';
import { usePlayer, type NowPlaying } from '@/stores/player';

/** How often the player is asked where it is. */
const POLL_MS = 500;
/** How old a reading can be and still be carried forward instead of asking again. */
const FRESH_MS = 2000;
/**
 * How fast a book's length takes a correction in, in seconds of length a
 * second. A book's length is an estimate that firms up as its sentences are
 * made (`book-clock`), and in a short one (a blog post) each correction moved
 * the time left by seconds, back and forth. Taken in at under one second a
 * second, the time left still only ever counts down while it plays, and the
 * thumb only moves on.
 */
const LENGTH_ABSORB = 0.5;

/** The last reading any surface took, shared so the next surface to mount can start from it. */
let lastRead: PositionRead | null = null;

const itemIdOf = (current: NowPlaying | null) => (current?.kind === 'book' ? `book:${current.bookId}` : (current?.episodeId ?? null));

/**
 * How fast the clock moves while playing. An episode's clock is its own
 * seconds, so it runs at the playback speed; a book's is already divided by
 * the speed (`bookClockNow`), so it runs at one second a second.
 */
export const clockRate = (current: NowPlaying | null, speed: number) => (current?.kind === 'book' ? 1 : speed);

/**
 * Asks the native player where it is: its reported position, or a seek's
 * target while the player is still catching up to it, so a scrub never snaps
 * back to where it started. Drops the hold once the player has arrived.
 *
 * The call blocks: the player's controller lives on the main thread, and the
 * JS thread waits there for the answer. Cheap between frames, but a wait for
 * as long as the main thread is busy, so it is for timers and effects on a
 * screen that has landed, never for a render or a screen still opening.
 */
export function readPlayback(): { position: number; duration: number } {
  const state = usePlayer.getState();
  const progress = state.current?.kind === 'book' ? bookClockNow() : TrackPlayer.getProgress();
  const now = Date.now();
  const { position, released } = heldPosition(progress.position, state.seekHold, now);
  if (released) state.patch({ seekHold: null });
  const itemId = itemIdOf(state.current);
  if (itemId) {
    lastRead = {
      itemId,
      position,
      duration: progress.duration,
      at: now,
      rate: state.isPlaying ? clockRate(state.current, state.speed) : 0,
    };
  }
  return { position, duration: progress.duration };
}

/**
 * Where the audio is right now without asking: the last reading, carried
 * forward. Null when there is no reading of the episode in the player newer
 * than `maxAgeMs`, and the player has to be asked after all.
 */
export function estimatedPlayback(maxAgeMs = FRESH_MS): { position: number; duration: number } | null {
  const { loaded, current } = usePlayer.getState();
  const now = Date.now();
  if (!loaded || !lastRead || lastRead.itemId !== itemIdOf(current) || now - lastRead.at > maxAgeMs) return null;
  return { position: positionSince(lastRead, now), duration: lastRead.duration };
}

/**
 * Where the episode in the player is, for something that times itself by it:
 * a reading newer than `maxAgeMs` carried forward, else the player asked.
 * Before the player has the episode (restored after a restart, not yet
 * played) it is where it was left, as the scrubber shows: the player would
 * say zero. A seek still landing is only known by asking.
 */
export function playbackPosition(maxAgeMs = FRESH_MS): number {
  const { loaded, current, seekHold } = usePlayer.getState();
  if (!loaded) return current?.kind === 'book' ? bookClockNow().position : (current?.positionSec ?? 0);
  const borrowed = seekHold ? null : estimatedPlayback(maxAgeMs);
  return (borrowed ?? readPlayback()).position;
}

export type PlaybackClock = {
  /** Seconds, animated linearly between polls so a bar glides rather than steps. */
  position: SharedValue<number>;
  duration: SharedValue<number>;
};

/**
 * Where the player is, as shared values, for the bars that draw it.
 *
 * Polled rather than pushed: the native progress event only comes every few
 * seconds (it is for saving, not drawing). Each poll animates the value to
 * where the audio will be by the next one, so the fill moves continuously on
 * the UI thread and React never renders for it. Stops polling when nothing is
 * loaded, and when the surface drawing it unmounts.
 *
 * A surface that mounts while another was polling (the full player, opened
 * from the mini player) starts from that surface's last reading instead of
 * asking again: its first frame is in the right place, and nothing waits on
 * the main thread while it is opening.
 *
 * An episode restored after a restart, not yet loaded, shows where it was
 * left (`fallbackPosition`) rather than zero.
 */
export function usePlaybackClock(storedPosition: number, storedDuration: number, active = true): PlaybackClock {
  // A book's stored place is in the audio's own seconds; its clock is at the listener's speed.
  const storedRate = usePlayer((s) => (s.current?.kind === 'book' && s.speed > 0 ? s.speed : 1));
  const fallbackPosition = storedPosition / storedRate;
  const fallbackDuration = storedDuration / storedRate;
  const loaded = usePlayer((s) => s.loaded);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const speed = usePlayer((s) => clockRate(s.current, s.speed));
  const book = usePlayer((s) => s.current?.kind === 'book');
  // The length shown, kept across runs of the effect below (a pause, the
  // voice waiting for its next sentence) so a correction is never taken in at
  // once. Started afresh for another item, or another speed: a book's length
  // changes at once with its speed (its clock is at the listener's speed).
  const shown = React.useRef({ of: '', length: 0 });
  const shownOf = usePlayer((s) => `${itemIdOf(s.current)}|${s.speed}`);
  const [seed] = React.useState(estimatedPlayback);
  const position = useSharedValue(seed?.position ?? fallbackPosition);
  const duration = useSharedValue(seed && seed.duration > 0 ? seed.duration : fallbackDuration);
  // Whether the next start can go by the seed rather than a read. Only the
  // first: a later one (a pause, a new speed) has to be exact.
  const seeded = React.useRef(seed !== null);

  React.useEffect(() => {
    if (!loaded) {
      position.set(fallbackPosition);
      duration.set(fallbackDuration);
      return;
    }
    const glide = (from: number, animate: boolean) => {
      const ahead = animate ? from + (POLL_MS / 1000) * speed : from;
      position.set(animate ? withTiming(ahead, { duration: POLL_MS, easing: Easing.linear }) : ahead);
    };
    // A book's shown length moves toward the estimate by at most a step a
    // poll (`LENGTH_ABSORB`), gliding across the poll as the position does,
    // and only while it plays: paused (or back on a player left paused, the
    // voice having moved on meanwhile) nothing on it moves. Anything else, or
    // a book just put in the player, takes it at once.
    const settleLength = (next: number) => {
      const held = shown.current;
      if (!book || held.of !== shownOf || !(held.length > 0)) {
        shown.current = { of: shownOf, length: next };
        duration.set(next);
        return;
      }
      if (!isPlaying) return;
      const step = (LENGTH_ABSORB * POLL_MS) / 1000;
      const to = held.length + Math.min(step, Math.max(-step, next - held.length));
      if (to === held.length) return;
      held.length = to;
      duration.set(withTiming(to, { duration: POLL_MS, easing: Easing.linear }));
    };
    const read = (animate: boolean) => {
      const progress = readPlayback();
      if (progress.duration > 0) settleLength(progress.duration);
      glide(progress.position, animate);
    };
    const estimate = seeded.current ? estimatedPlayback() : null;
    seeded.current = false;
    if (estimate) glide(estimate.position, isPlaying);
    else read(false);
    // Nothing to draw for (a mini player on a screen that is covered): one
    // read so it is right when it shows again, and no polling meanwhile.
    if (!active) return;
    // Polled while paused too (a sync read, so it costs next to nothing): a
    // skip or a chapter jump made while paused has to move the bar as well.
    const id = setInterval(() => read(isPlaying), POLL_MS);
    return () => clearInterval(id);
  }, [active, book, duration, fallbackDuration, fallbackPosition, isPlaying, loaded, position, shownOf, speed]);

  return { position, duration };
}
