import { View } from 'react-native';

import { SkeletonBar, SkeletonGroup } from '@/components/skeletons/skeleton-group';

/**
 * Stand-in for a grid of `BookGridCard`s: the 2:3 cover, the title line (the
 * real one wraps to two), and the author line.
 *
 * It takes the same column width the screen derives from the live window and
 * hands to the real cards, so the placeholder grid and the grid that replaces
 * it are the same geometry — the covers do not move when the swap happens.
 */
export function BookGridSkeleton({
  width,
  columns = 2,
  rows = 3,
}: {
  /** Column width in dp — the same number the screen gives `BookGridCard`. */
  width: number;
  columns?: number;
  rows?: number;
}) {
  return (
    <SkeletonGroup label="Loading books" className="gap-4">
      {Array.from({ length: rows }, (_, row) => (
        <View key={row} className="flex-row gap-4">
          {Array.from({ length: columns }, (_, col) => (
            <View key={col} className="gap-2" style={{ width }}>
              <SkeletonBar
                className="aspect-[2/3] w-full"
              />
              <SkeletonBar className="h-3.5 w-5/6" />
              <SkeletonBar className="h-3 w-1/2" />
            </View>
          ))}
        </View>
      ))}
    </SkeletonGroup>
  );
}
