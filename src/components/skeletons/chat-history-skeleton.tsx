import { View } from 'react-native';

import { SkeletonBar, SkeletonGroup } from '@/components/skeletons/skeleton-group';

/**
 * Stand-in for the session rows in `ChatHistorySheet`: the rounded-square icon
 * slot, the session title with its right-aligned age ("2D AGO"), and the reply
 * preview under it.
 *
 * The title widths vary because session titles do, and the age column is a
 * fixed short bar at the end of the title line — that pairing is what makes a
 * row read as a past chat rather than as a generic list item.
 */
const TITLE_WIDTHS = ['w-3/5', 'w-2/5', 'w-1/2', 'w-3/4', 'w-2/5', 'w-1/2', 'w-3/5'] as const;

export function ChatHistorySkeleton({ count = 7 }: { count?: number }) {
  return (
    <SkeletonGroup label="Loading past chats">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} className="flex-row items-center gap-4 px-6 py-4">
          <SkeletonBar className="h-10 w-10 rounded-lg" />
          <View className="flex-1 gap-2">
            <View className="flex-row items-center justify-between gap-3">
              <SkeletonBar className={`h-3.5 ${TITLE_WIDTHS[i % TITLE_WIDTHS.length]}`} />
              <SkeletonBar className="h-2.5 w-12" />
            </View>
            <SkeletonBar className="h-3 w-full" />
          </View>
        </View>
      ))}
    </SkeletonGroup>
  );
}
