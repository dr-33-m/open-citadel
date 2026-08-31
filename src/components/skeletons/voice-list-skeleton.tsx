import { View } from 'react-native';

import { SkeletonBar, SkeletonGroup } from '@/components/skeletons/skeleton-group';

/**
 * Stand-in for the voice picker's rows.
 *
 * The list is grouped by language, so the placeholder is too: a short heading
 * bar, then a run of rows under it. A flat run of identical rows would settle
 * into something visibly different once the real headings pushed everything
 * down, which is the jolt the placeholder exists to avoid.
 *
 * Each row is the voice name over its language tag, with the quality chip
 * ("ENHANCED") right-aligned — the same three parts, in the same places, as
 * `VoiceRow`.
 */
const NAME_WIDTHS = ['w-2/5', 'w-3/5', 'w-1/2', 'w-2/3', 'w-1/2', 'w-3/5'] as const;

/** Enough to fill the half-height detent the sheet opens at. */
const GROUPS = [3, 4, 3] as const;

export function VoiceListSkeleton() {
  let row = 0;
  return (
    <SkeletonGroup label="Loading voices">
      {GROUPS.map((rows, group) => (
        <View key={group}>
          <View className="px-6 py-2">
            <SkeletonBar className="h-2.5 w-8" />
          </View>
          {Array.from({ length: rows }, () => {
            const width = NAME_WIDTHS[row++ % NAME_WIDTHS.length];
            return (
              <View
                key={row}
                className="flex-row items-center gap-4 border-b border-card px-6 py-4"
              >
                <View className="flex-1 gap-1">
                  <SkeletonBar className={`h-3.5 ${width}`} />
                  <SkeletonBar className="h-2.5 w-16" />
                </View>
                <SkeletonBar className="h-4 w-20" />
              </View>
            );
          })}
        </View>
      ))}
    </SkeletonGroup>
  );
}
