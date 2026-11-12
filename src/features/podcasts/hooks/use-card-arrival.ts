import React from 'react';
import type { EntryAnimationsValues } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { slideUpFromEdge } from '@/constants/theme';

/**
 * The mini player card coming up from the bottom edge, and whether it has
 * landed. A card still sliding in is not yet something to grow the player
 * out of: the player opened as playback starts (Listen, from a book's menu)
 * would grow out of a card in motion, half arrived. Until it has landed the
 * player rises from the bottom edge instead (`playerTransition`). A card
 * that came with the screen (`arrives` false) has landed from the start.
 */
export function useCardArrival(arrives: boolean) {
  const [landed, setLanded] = React.useState(!arrives);
  const entering = React.useMemo(
    () =>
      arrives
        ? (values: EntryAnimationsValues) => {
            'worklet';
            return { ...slideUpFromEdge(values), callback: () => scheduleOnRN(setLanded, true) };
          }
        : undefined,
    [arrives],
  );
  return { entering, landed };
}
