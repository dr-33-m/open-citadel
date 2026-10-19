import React from 'react';
import { View } from 'react-native';

import { SkeletonBar, SkeletonGroup } from '@/components/skeletons/skeleton-group';

/** Title widths vary down the column because titles do. */
const TITLE_WIDTHS = ['w-4/5', 'w-3/5', 'w-5/6', 'w-1/2', 'w-3/4', 'w-2/3'] as const;

/**
 * Stand-in for a picker's square-picture rows (a post, an episode): the
 * picture, the small line and a title, in one `SkeletonGroup` so the list
 * pulses as one node.
 */
export function PickerRowsSkeleton({ label, count = 6 }: { label: string; count?: number }) {
  return (
    <SkeletonGroup label={label}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} className="flex-row items-center gap-3 px-6 py-3">
          <View className="bg-skeleton" style={{ width: 56, height: 56 }} />
          <View className="flex-1 gap-2">
            <SkeletonBar className="h-2.5 w-2/5" />
            <SkeletonBar className={`h-3.5 ${TITLE_WIDTHS[i % TITLE_WIDTHS.length]}`} />
          </View>
        </View>
      ))}
    </SkeletonGroup>
  );
}
