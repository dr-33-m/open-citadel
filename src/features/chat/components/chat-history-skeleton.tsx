import React from 'react';
import { View } from 'react-native';

import { SkeletonBar, SkeletonGroup } from '@/components/skeletons/skeleton-group';

/** Titles vary down the column because chat names do. */
const TITLE_WIDTHS = ['w-3/5', 'w-4/5', 'w-1/2', 'w-2/3', 'w-3/4', 'w-2/5'] as const;
const LINE_WIDTHS = ['w-4/5', 'w-3/5', 'w-5/6', 'w-2/3'] as const;

/** About a screenful of the sheet; more would only be drawn under the fold. */
const MOST_ROWS = 9;

/**
 * Stand-in for the History rows while the sheet rises: the kind's square, the
 * name with its time at the right, and the last words under it, at the row's
 * own padding, so nothing moves as the list fades in over it. One row a chat,
 * up to a screenful, so a short history does not shrink as it arrives.
 */
export function ChatHistorySkeleton({ count }: { count: number }) {
  const rows = Math.min(count, MOST_ROWS);
  return (
    <SkeletonGroup label="Loading past chats">
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} className="flex-row items-center gap-3 px-4 py-3">
          <View className="bg-skeleton" style={SQUARE} />
          <View className="flex-1 gap-2">
            <View className="flex-row items-center justify-between gap-2">
              <SkeletonBar className={`h-4 ${TITLE_WIDTHS[i % TITLE_WIDTHS.length]}`} />
              <SkeletonBar className="h-2.5 w-10" />
            </View>
            <SkeletonBar className={`h-3 ${LINE_WIDTHS[i % LINE_WIDTHS.length]}`} />
          </View>
        </View>
      ))}
    </SkeletonGroup>
  );
}

/** `PrefixIcon`'s box. */
const SQUARE = { width: 40, height: 40 };
