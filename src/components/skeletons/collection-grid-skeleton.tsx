import { View } from 'react-native';

import { SkeletonBar, SkeletonGroup } from '@/components/skeletons/skeleton-group';

/**
 * Stand-in for the section screen's `CollectionCell`: a padded card with the
 * collection name over the smaller gold count line.
 *
 * The cells flex to the column rather than taking a measured width, exactly as
 * the real ones do, so the placeholder grid and the grid replacing it share
 * their geometry.
 */
const NAME_WIDTHS = ['w-3/4', 'w-1/2', 'w-5/6', 'w-2/3', 'w-3/5', 'w-4/5'] as const;

export function CollectionGridSkeleton({
  columns = 2,
  rows = 3,
}: {
  columns?: number;
  rows?: number;
}) {
  return (
    <SkeletonGroup label="Loading collections" className="gap-4">
      {Array.from({ length: rows }, (_, row) => (
        <View key={row} className="flex-row gap-4">
          {Array.from({ length: columns }, (_, col) => (
            <View key={col} className="flex-1 gap-2 bg-card p-5">
              <SkeletonBar
                className={`h-4 ${NAME_WIDTHS[(row * columns + col) % NAME_WIDTHS.length]}`}
              />
              <SkeletonBar className="h-3 w-1/3" />
            </View>
          ))}
        </View>
      ))}
    </SkeletonGroup>
  );
}
