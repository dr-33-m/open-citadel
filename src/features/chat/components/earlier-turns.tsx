import { useAnimatedReaction } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useMessageScrollerEdgeDistance } from '@/components/ui/message-scroller';

/** How near the top of what is drawn the reader comes before the page above is drawn. */
const NEAR_TOP_PX = 600;

type EarlierTurnsProps = {
  /** There is more above, and the chat has been shown. */
  enabled: boolean;
  onReach: () => void;
};

/**
 * Asks for the page above when the reader scrolls up towards it: Bluesky's
 * `onStartReached`, for a scroller that is not a list.
 *
 * Asked while the reader scrolls up within `NEAR_TOP_PX` of the top, and
 * the hook draws one page per request until the last one has landed. Read on
 * the UI thread from the distances the scroller already keeps, so it costs
 * nothing while the reader scrolls.
 * Renders nothing; it sits inside `MessageScroller` for its context.
 */
export function EarlierTurns({ enabled, onReach }: EarlierTurnsProps) {
  const { start } = useMessageScrollerEdgeDistance();

  useAnimatedReaction(
    () => start.get(),
    (distance, previous) => {
      // Moving up, near the top: the reader is heading for what is above.
      // Where the transcript sits when it opens is not a request, however
      // near the top a short first page leaves it.
      const movingUp = previous !== null && distance < previous - 1;
      if (enabled && movingUp && distance < NEAR_TOP_PX) scheduleOnRN(onReach);
    },
    [enabled, onReach],
  );

  return null;
}
