import { View } from 'react-native';

import { SkeletonBar, SkeletonGroup } from '@/components/skeletons/skeleton-group';

/** One shelf: its heading and VIEW ALL, then a row of covers running off the
 *  trailing edge exactly as the real one does. */
function Shelf({ tall }: { tall?: boolean }) {
  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between px-6">
        <SkeletonBar className="h-6 w-40" />
        {/* The VIEW ALL card, at the size it now is. */}
        <SkeletonBar className="h-7 w-20" />
      </View>
      {tall ? (
        // Currently Reading is one wide card rather than a row of covers.
        <View className="mx-6 gap-3 border border-border bg-card p-4">
          <View className="flex-row gap-4">
            <SkeletonBar className="h-32 w-24" />
            <View className="flex-1 gap-2 pt-1">
              <SkeletonBar className="h-6 w-full" />
              <SkeletonBar className="h-6 w-2/3" />
              <SkeletonBar className="h-4 w-1/2" />
              <SkeletonBar className="mt-2 h-1.5 w-full" />
            </View>
          </View>
        </View>
      ) : (
        <View className="flex-row gap-4 pl-6">
          {[0, 1, 2].map((i) => (
            <View key={i} className="w-40 gap-3 bg-muted p-4">
              <SkeletonBar className="aspect-[2/3] w-full" />
              <View className="gap-1">
                <SkeletonBar className="h-4 w-5/6" />
                <SkeletonBar className="h-3 w-1/2" />
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * The Library while it boots.
 *
 * A spinner used to hold this moment, and a spinner says only "wait" — it has
 * no shape, so the screen arrives as a jump from an empty page to a full one.
 * Every other loading surface in the app already draws what is coming
 * (`BookGridSkeleton`, `SettingsSkeleton`, the Compass sheets); this was the
 * one that did not, and it is the first screen anyone sees.
 *
 * Three shelves, because that is what the Library opens with: the wide
 * Currently Reading card, then two rows of covers. The heights are the real
 * ones so the content does not shift underneath when the swap happens.
 */
export function LibrarySkeleton() {
  return (
    <SkeletonGroup label="Loading your library" className="gap-8 pt-4">
      <Shelf tall />
      <Shelf />
      <Shelf />
    </SkeletonGroup>
  );
}
