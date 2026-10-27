import type { FlashListRef } from '@shopify/flash-list';
import React from 'react';

/** Where the spoken line sits while following: about a third down the sheet. */
export const FOLLOW_AT = 0.33;
/** Lines the list starts above the one it opens on: the short stretch it glides down. */
const RUN_UP = 6;
/** How long the opened list is seen still before it glides. */
const GLIDE_AFTER_MS = 150;
/** Earlier lines put back above at a time, as the list nears the top of what it holds. */
const PAGE = 40;

/** What the list holds: the rows from `from` on. A new epoch is a new list, opened beside `target`. */
type Chunk = { from: number; epoch: number; target: number | null; at: number };

/**
 * Keeping a follow-along list (an episode's transcript, a book's text) on the
 * row being spoken, the way a chat opens on a
 * linked message (Expensify's `initialScrollKey` and paged report actions):
 * never by scrolling the whole way there.
 *
 * The list holds the transcript from a few lines above the spoken line on, so
 * it opens already beside it, then glides those few lines to put it a third
 * of the way down. Scrolling up nears the top of what it holds and the lines
 * before are put back a page at a time, with what is on screen kept still. A
 * jump to a line above what it holds (an earlier search match, a seek a long
 * way back) starts the list again there instead of crossing hundreds of lines.
 *
 * While following, each new line is brought a third of the way down. Dragging
 * the list stops that; "Back to now" or a tap on a line starts it again.
 * Every opening starts by following.
 */
export function useFollowAlong<T>({
  visible,
  current,
  resetKey,
}: {
  visible: boolean;
  current: number;
  /** What the rows are of (a book's chapter): when it changes, the list starts over as on opening. */
  resetKey?: unknown;
}) {
  const list = React.useRef<FlashListRef<T>>(null);
  const [following, setFollowing] = React.useState(true);
  // Null until the spoken line is known on opening.
  const [chunk, setChunk] = React.useState<Chunk | null>(null);
  // Which list has laid out: nothing scrolls it before, so the glide is seen.
  const [ready, setReady] = React.useState(-1);
  // Paging up waits for a finger: at the top of what it holds on opening, the
  // list would otherwise page before it has glided.
  const [touched, setTouched] = React.useState(false);

  const [wasVisible, setWasVisible] = React.useState(visible);
  const [seenKey, setSeenKey] = React.useState(resetKey);
  if (wasVisible !== visible || seenKey !== resetKey) {
    setWasVisible(visible);
    setSeenKey(resetKey);
    if (visible) {
      setFollowing(true);
      setTouched(false);
      setChunk(null);
      setReady(-1);
    }
  }
  const from = chunk?.from ?? 0;
  const epoch = chunk?.epoch ?? 0;

  /** Starts the list again beside a line above what it holds. Called while rendering, never in an effect. */
  const cover = (index: number, at = FOLLOW_AT) => {
    if (index >= 0 && index < from) setChunk({ from: Math.max(0, index - RUN_UP), epoch: epoch + 1, target: index, at });
  };
  if (visible && chunk === null && current >= 0) setChunk({ from: Math.max(0, current - RUN_UP), epoch: 0, target: null, at: FOLLOW_AT });
  const live = ready === epoch;
  // A seek back past what the list holds.
  if (live && following && current >= 0 && current < from) cover(current);

  // Read when a scroll is asked for, so `jump` never changes and a page put
  // back above never sets off a scroll that was already done.
  const fromRef = React.useRef(from);
  React.useEffect(() => {
    fromRef.current = from;
  }, [from]);
  const jump = React.useCallback((index: number, viewPosition = FOLLOW_AT) => {
    const at = index - fromRef.current;
    if (at < 0 || !list.current) return;
    // A row too tall to sit a third of the way down (a long sentence, a long
    // line) goes to the top instead. Placed by `viewPosition` it was scrolled
    // past its own start (FlashList moves by the room left over, which goes
    // negative), and the words being spoken were above the sheet.
    const height = list.current.getLayout(at)?.height ?? 0;
    const room = list.current.getWindowSize().height;
    const position = room > 0 && height > room * (1 - viewPosition) ? 0 : viewPosition;
    void list.current.scrollToIndex({ index: at, viewPosition: position, animated: true });
  }, []);

  const followed = live && following ? current : -1;
  React.useEffect(() => {
    if (followed >= 0) jump(followed);
  }, [followed, jump]);
  // A list started beside a line that is not the spoken one (a search match): to it, once.
  const target = live && chunk?.target != null ? chunk.target : null;
  const targetAt = chunk?.at ?? FOLLOW_AT;
  React.useEffect(() => {
    if (target !== null && !following) jump(target, targetAt);
    // Once per list: not again as the spoken line moves on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, epoch]);

  const onListLoad = () => {
    setTimeout(() => setReady(epoch), GLIDE_AFTER_MS);
  };
  const onStartReached = () => {
    if (touched && from > 0) setChunk({ from: Math.max(0, from - PAGE), epoch, target: null, at: FOLLOW_AT });
  };

  return {
    listRef: list,
    from,
    /** Changes when the list starts again somewhere else: the list's key. */
    epoch,
    /** Opened, and the spoken line not yet known: the list waits rather than being cut down under itself. */
    placing: visible && chunk === null,
    following,
    jump,
    cover,
    onListLoad,
    onStartReached,
    follow: () => setFollowing(true),
    stopFollowing: () => setFollowing(false),
    onDrag: () => {
      setTouched(true);
      setFollowing(false);
    },
  };
}
