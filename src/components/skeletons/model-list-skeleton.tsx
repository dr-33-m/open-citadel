import { View } from 'react-native';

import { SkeletonBar, SkeletonGroup } from '@/components/skeletons/skeleton-group';

/**
 * Stand-in for a row in the brain picker: the name, then the line of detail
 * under it (size and state for a local brain, downloads for a catalogue one,
 * size for a version).
 *
 * Name widths vary because model names do. One pulse drives the whole group,
 * for the reason `SkeletonGroup` gives: a bar per animation is what made the
 * other drawers slow on an A33.
 */
const NAME_WIDTHS = ['w-3/5', 'w-4/5', 'w-1/2', 'w-2/3', 'w-3/4'] as const;

export function ModelListSkeleton({
  count = 5,
  label = 'Loading brains',
}: {
  count?: number;
  label?: string;
}) {
  return (
    <SkeletonGroup label={label}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} className="gap-2 px-6 py-3">
          <SkeletonBar className={`h-4 ${NAME_WIDTHS[i % NAME_WIDTHS.length]}`} />
          <SkeletonBar className="h-3 w-1/3" />
        </View>
      ))}
    </SkeletonGroup>
  );
}
