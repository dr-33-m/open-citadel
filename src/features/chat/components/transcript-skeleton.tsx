import React from 'react';
import { useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';

import { SkeletonBar, SkeletonGroup } from '@/components/skeletons/skeleton-group';
import { skeletonExchanges } from '@/features/chat/utils/transcript-skeleton';

type TranscriptSkeletonProps = {
  /** Omitted inside a scroller that already sits in the column. */
  contentColumn?: StyleProp<ViewStyle>;
  /** The room under the last message: what the floating input card covers. */
  floatingClearance: StyleProp<ViewStyle>;
};

/** One exchange's shape: the reader's question on the right, his answer under it. */
function Exchange({ long }: { long: boolean }) {
  return (
    <View className="gap-6">
      <View className="items-end">
        <SkeletonBar className={long ? 'h-12 w-3/5' : 'h-10 w-2/5'} />
      </View>
      <View className="gap-3">
        <SkeletonBar className="h-4 w-full" />
        <SkeletonBar className="h-4 w-11/12" />
        {long ? <SkeletonBar className="h-4 w-4/5" /> : null}
        <SkeletonBar className="h-4 w-2/3" />
      </View>
    </View>
  );
}

/**
 * A conversation on its way, filling the space it will fill: exchanges stacked
 * from the bottom up until the screen is covered, as Expensify's chat
 * skeleton counts its rows from the screen's height.
 */
export function TranscriptSkeleton({ contentColumn, floatingClearance }: TranscriptSkeletonProps) {
  const { height } = useWindowDimensions();
  const exchanges = skeletonExchanges(height);

  return (
    <View className="flex-1 justify-end overflow-hidden" style={contentColumn}>
      <SkeletonGroup label="Opening the chat" className="gap-6 px-4">
        {exchanges.map((key, index) => (
          <Exchange key={key} long={index % 2 === 0} />
        ))}
      </SkeletonGroup>
      <View style={floatingClearance} />
    </View>
  );
}
