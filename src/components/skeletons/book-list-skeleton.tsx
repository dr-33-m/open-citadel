import { View } from 'react-native';

import { SkeletonBar, SkeletonGroup } from '@/components/skeletons/skeleton-group';

/**
 * Stand-in for the book picker's `BookRow`: a 40x56 cover at the same 2:3 the
 * real covers are cropped to, then the title and the author line under it.
 *
 * Title widths vary down the column because book titles do; a stack of
 * identical bars is the tell that a placeholder was drawn from a loop rather
 * than from the row it stands for.
 */
const TITLE_WIDTHS = ['w-4/5', 'w-3/5', 'w-5/6', 'w-1/2', 'w-3/4', 'w-2/3'] as const;

export function BookListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <SkeletonGroup label="Loading library">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} className="flex-row items-center gap-3 px-6 py-3">
          <SkeletonBar className="h-[56px] w-[40px] rounded" />
          <View className="flex-1 gap-2">
            <SkeletonBar
              className={`h-3.5 ${TITLE_WIDTHS[i % TITLE_WIDTHS.length]}`}
            />
            <SkeletonBar className="h-3 w-2/5" />
          </View>
        </View>
      ))}
    </SkeletonGroup>
  );
}
