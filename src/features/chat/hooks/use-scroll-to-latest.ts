/**
 * Keeps the transcript pinned to the newest text.
 *
 * The two reasons to scroll are not the same event and used to share one
 * effect, which is what broke it. That effect ran on every token and each run
 * cancelled the previous run's 50ms timer, so during a reply arriving faster
 * than one token per 50ms — which is every reply — the timer was cancelled and
 * rescheduled forever and the list never scrolled at all. The transcript only
 * caught up when generation stopped and the cancelling stopped with it.
 *
 * So: a new message is a discrete event and gets an animated scroll. A stream
 * is continuous and gets a follow on a fixed cadence, which cannot starve
 * because the deadline is measured from the last scroll that actually
 * happened rather than from the last token.
 */
import { useEffect, useRef } from 'react';

/** How often the view follows a stream. Below roughly this the scroll costs
 *  more than the few pixels it gains; above it the text visibly outruns the
 *  viewport before catching up. */
const FOLLOW_INTERVAL_MS = 250;

/** Lets the new row lay out before scrolling to it, or the scroll lands at
 *  the old end. */
const NEW_MESSAGE_DELAY_MS = 50;

interface ScrollableToEnd {
  scrollToEnd: (options?: { animated?: boolean }) => void;
}

export function useScrollToLatest(
  ref: React.RefObject<ScrollableToEnd | null>,
  { messageCount, streamingContent }: { messageCount: number; streamingContent: string },
) {
  useEffect(() => {
    if (messageCount === 0) return undefined;
    const timer = setTimeout(
      () => ref.current?.scrollToEnd({ animated: true }),
      NEW_MESSAGE_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [messageCount, ref]);

  const lastFollowAt = useRef(0);
  useEffect(() => {
    if (streamingContent.length === 0) return undefined;

    const follow = () => {
      lastFollowAt.current = Date.now();
      // Unanimated: a 250ms animation started every 250ms would spend the
      // whole stream interrupting itself, and following text does not need
      // easing to be legible.
      ref.current?.scrollToEnd({ animated: false });
    };

    const since = Date.now() - lastFollowAt.current;
    if (since >= FOLLOW_INTERVAL_MS) {
      follow();
      return undefined;
    }

    // Trailing edge, so the last token of a reply is never left off-screen.
    const timer = setTimeout(follow, FOLLOW_INTERVAL_MS - since);
    return () => clearTimeout(timer);
  }, [streamingContent, ref]);
}
