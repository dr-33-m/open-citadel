import TrackPlayer from '@rntp/player';
import React from 'react';
import { Easing, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { positionSince, type PositionRead } from '@/features/podcasts/utils/playback-position';
import { heldPosition } from '@/utils/seek-hold';
import { usePodcastPlayer } from '@/stores/podcast-player';

/** How often the player is asked where it is. */
const POLL_MS = 500;
/** How old a reading can be and still be carried forward instead of asking again. */
const FRESH_MS = 2000;

/** The last reading any surface took, shared so the next surface to mount can start from it. */
let lastRead: PositionRead | null = null;

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
  const state = usePodcastPlayer.getState();
  const progress = TrackPlayer.getProgress();
  const now = Date.now();
  const { position, released } = heldPosition(progress.position, state.seekHold, now);
  if (released) state.patch({ seekHold: null });
  if (state.current) {
    lastRead = {
      episodeId: state.current.episodeId,
      position,
      duration: progress.duration,
      at: now,
      rate: state.isPlaying ? state.speed : 0,
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
  const { loaded, current } = usePodcastPlayer.getState();
  const now = Date.now();
  if (!loaded || !lastRead || lastRead.episodeId !== current?.episodeId || now - lastRead.at > maxAgeMs) return null;
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
  const { loaded, current, seekHold } = usePodcastPlayer.getState();
  if (!loaded) return current?.positionSec ?? 0;
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
export function usePlaybackClock(fallbackPosition: number, fallbackDuration: number, active = true): PlaybackClock {
  const loaded = usePodcastPlayer((s) => s.loaded);
  const isPlaying = usePodcastPlayer((s) => s.isPlaying);
  const speed = usePodcastPlayer((s) => s.speed);
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
    const read = (animate: boolean) => {
      const progress = readPlayback();
      if (progress.duration > 0) duration.set(progress.duration);
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
  }, [active, duration, fallbackDuration, fallbackPosition, isPlaying, loaded, position, speed]);

  return { position, duration };
}
