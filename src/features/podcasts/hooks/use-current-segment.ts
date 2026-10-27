import React from 'react';

import { clockRate, estimatedPlayback, playbackPosition } from '@/features/podcasts/hooks/use-playback-clock';
import { segmentIndexAt } from '@/features/podcasts/utils/transcript-rows';
import { usePlayer } from '@/stores/player';

/**
 * How far ahead of the words a line lights: its fade has finished as they
 * start, the way lyrics are timed. Lit on the beat, it read as late.
 */
const LEAD_SEC = 0.25;
/** The longest the player goes unasked while playing, so a seek or a stall is caught. */
const RESYNC_MS = 1500;
/** The soonest it is asked again, so a line a moment long cannot spin the timer. */
const MIN_WAIT_MS = 60;
/** Paused, still asked now and then, so a tap on a line moves the light at once. */
const PAUSED_MS = 750;
/**
 * A reading another surface took this recently (the scrubber under the list
 * reads twice a second) is carried forward rather than asking the player
 * again: every ask blocks this thread until the main thread answers, which a
 * list being flung cannot spare.
 */
const BORROW_MS = 600;
/**
 * How long a line lit by `place` outlasts a reading that disagrees: an
 * episode still loading reports its old place until it has landed on the
 * new one, and the light would go back there and the list with it.
 */
const PLACE_HOLD_MS = 2500;

/**
 * The transcript line being spoken, for the lit line: an episode's
 * transcript, or a book's text (a line a sentence, `sentenceStarts`).
 *
 * Not polled on a fixed beat, which lit each line up to half a second late:
 * every reading works out when the next line starts at the current speed and
 * asks again just then, and at least every second and a half anyway. It
 * renders again only when the line changes: the clock never reaches the
 * list, only a new index does. A seek the transcript makes itself (a tap on
 * a line) is lit straight away with `place`. `active` is false when the sheet is closed,
 * the episode is not the one in the player, or the transcript has no times.
 */
export function useCurrentSegment(starts: readonly number[], active: boolean) {
  const isPlaying = usePlayer((s) => s.isPlaying);
  // How fast the clock runs: an episode's at its speed, a book's already at the listener's.
  const rate = usePlayer((s) => clockRate(s.current, s.speed));
  // A skip or a scrub: read again at once, not when the next line was due.
  const moved = usePlayer((s) => s.movedAt);
  // Without asking the player: this runs while rendering.
  const seed = () =>
    segmentIndexAt(starts, (estimatedPlayback()?.position ?? usePlayer.getState().current?.positionSec ?? 0) + LEAD_SEC);
  const [index, setIndex] = React.useState(seed);
  const placed = React.useRef<{ line: number; at: number } | null>(null);
  // Opened again: from where the audio is now, not where it was last time.
  const [wasActive, setWasActive] = React.useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    if (active) setIndex(seed());
  }

  React.useEffect(() => {
    if (!active || starts.length === 0) return;
    let timer: ReturnType<typeof setTimeout>;
    const read = () => {
      const position = playbackPosition(BORROW_MS) + LEAD_SEC;
      const at = segmentIndexAt(starts, position);
      // Until the audio is there, the line it was sent to stays lit.
      const held = placed.current;
      const arriving = held !== null && at !== held.line && Date.now() - held.at < PLACE_HOLD_MS;
      if (!arriving) {
        placed.current = null;
        setIndex(at);
      }
      const next = starts[at + 1];
      const wait = !isPlaying
        ? PAUSED_MS
        : next === undefined
          ? RESYNC_MS
          : Math.min(RESYNC_MS, Math.max(MIN_WAIT_MS, ((next - position) / Math.max(rate, 0.1)) * 1000));
      timer = setTimeout(read, wait);
    };
    // Read now, not on a timer: after a skip the thread is busy with what
    // the skip set off (the next sentence asked for, the place saved), and a
    // timer of nothing waited behind all of it, the line seconds late.
    read();
    return () => clearTimeout(timer);
    // `moved` only starts it again, reading at once.
  }, [active, isPlaying, rate, starts, moved]);

  /**
   * A line the audio has just been sent to, lit at once rather than when the
   * player next says so: the list follows the lit line, and lit late it
   * glided back to the line that was playing before going on to this one.
   */
  const place = React.useCallback((line: number) => {
    placed.current = { line, at: Date.now() };
    setIndex(line);
  }, []);

  return { current: active ? index : -1, place };
}
