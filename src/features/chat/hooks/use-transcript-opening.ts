import React from 'react';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { pageStart } from '@/features/chat/utils/transcript-window';
import type { ChatMessage } from '@/services/chat-sessions';

/** The cross-fade from skeleton to transcript once it is in place. */
const REVEAL_MS = 200;
/**
 * Shown regardless after this long. A transcript that never reported opening
 * would otherwise stay invisible: Bluesky shipped exactly that bug (APP-2238).
 */
const REVEAL_FALLBACK_MS = 800;

/**
 * How one conversation opens, the way Bluesky's chat opens one: its newest
 * page drawn out of sight, put at its end by the scroller, and only then faded
 * in over the skeleton that held its place. Older pages are drawn when the
 * reader scrolls up to them (`loadEarlier`), never on their own: nothing is
 * added above the chat while the reader is only looking at it.
 *
 * Tried first and dropped: the newest ten turns, then the rest added above a
 * moment later (Mattermost's order). Our scroller keeps the reader's place
 * after content is added above by correcting from JavaScript once the new
 * layout arrives, which is slow here, so the chat visibly jumped and settled
 * after opening. Drawing all of it before the reveal fixed that but cost the
 * whole chat's layout up front: about five seconds of skeleton for a 20-turn
 * chat on a debug build.
 *
 * Mounted under a key per conversation (`TranscriptBody`), so each one opens
 * with fresh state. History is not animated, which is Bluesky's rule too:
 * opening a 24-turn chat used to start 24 entrance animations under a fade.
 */
export function useTranscriptOpening(turns: readonly ChatMessage[]) {
  const [history] = React.useState(() => new Set(turns.map((turn) => turn.id)));
  // Where the drawn turns begin. Turns only ever arrive at the end, so this
  // stays put as the chat goes on, and moves back a page at a time.
  const [start, setStart] = React.useState(() => pageStart(turns, turns.length));
  const latest = React.useRef(turns);
  React.useEffect(() => {
    latest.current = turns;
  }, [turns]);
  const [waiting, setWaiting] = React.useState(() => turns.length > 0);
  const shown = useSharedValue(turns.length === 0 ? 1 : 0);
  // Once: the scroller's signal and the fallback can both arrive.
  const revealing = React.useRef(turns.length === 0);

  const onOpened = React.useCallback(() => {
    if (revealing.current) return;
    revealing.current = true;
    shown.set(withTiming(1, { duration: REVEAL_MS }));
    // The skeleton underneath goes once it has faded, rather than pulsing on unseen.
    setTimeout(() => setWaiting(false), REVEAL_MS);
  }, [shown]);

  React.useEffect(() => {
    const fallback = setTimeout(onOpened, REVEAL_FALLBACK_MS);
    return () => clearTimeout(fallback);
  }, [onOpened]);

  /** The page before the one drawn first, once the reader has scrolled up to it. */
  // One page per request until it has landed: scrolling asks many times a second.
  const drawnFrom = React.useRef(start);
  React.useEffect(() => {
    drawnFrom.current = start;
  }, [start]);
  const asked = React.useRef<number | null>(null);
  const loadEarlier = React.useCallback(() => {
    const from = drawnFrom.current;
    if (from === 0 || asked.current === from) return;
    asked.current = from;
    setStart(pageStart(latest.current, from));
  }, []);

  // A turn removed from the drawn part (a message deleted) cannot leave the start past the end.
  const from = Math.min(start, Math.max(0, turns.length - 1));
  const drawn = React.useMemo(() => turns.slice(from), [turns, from]);
  const isHistory = React.useCallback((id: string) => history.has(id), [history]);
  const revealStyle = useAnimatedStyle(() => ({ opacity: shown.get() }));
  const skeletonStyle = useAnimatedStyle(() => ({ opacity: 1 - shown.get() }));

  return { drawn, hasEarlier: from > 0, loadEarlier, isHistory, onOpened, revealStyle, skeletonStyle, waiting };
}
