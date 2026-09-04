import React from 'react';
import { View } from 'react-native';

import { SkeletonBar, SkeletonGroup } from '@/components/skeletons/skeleton-group';

/**
 * The insights sheet's placeholder, held up by `Sheet.Deferred` while the sheet
 * rises.
 *
 * That body is the heaviest commit in Compass — two SVG charts, a pair of stat
 * cards and a horizontal shelf — and it used to land *during* the sheet's own
 * animation, competing with it for the UI thread. Held back, the rise is the
 * rise and the mount happens once it is over.
 *
 * Only the insights sheet gets one. `Sheet.Deferred` is sound only in a sheet
 * whose height is fixed, and insights has `snapRatios`; the planner and the log
 * deck are content-sized, so a placeholder of a different height makes the
 * sheet open small and then jump when the real body arrives. Giving those two a
 * fixed detent instead was tried and is worse: `Planner`'s week rows collapse
 * on top of each other when the sheet hands them a bounded box.
 *
 * One pulse per placeholder, never one per bar — see `SkeletonGroup`.
 */
export function InsightsSkeleton() {
  return (
    <SkeletonGroup label="Loading insights" className="gap-4 px-4 pb-6">
      <SkeletonBar className="h-3 w-24" />
      <View className="gap-3 border border-border bg-card p-4">
        <SkeletonBar className="h-5 w-2/3" />
        <SkeletonBar className="h-2 w-full" />
        <View className="flex-row justify-between">
          <SkeletonBar className="h-3 w-24" />
          <SkeletonBar className="h-3 w-16" />
        </View>
      </View>
      <View className="items-center gap-3 border border-border bg-card p-4">
        <SkeletonBar className="h-3 w-28 self-start" />
        <SkeletonBar className="h-[190px] w-[190px]" />
        <SkeletonBar className="h-3 w-full" />
        <SkeletonBar className="h-3 w-full" />
      </View>
      <View className="flex-row gap-4">
        <SkeletonBar className="h-24 flex-1" />
        <SkeletonBar className="h-24 flex-1" />
      </View>
      <SkeletonBar className="h-44 w-full" />
    </SkeletonGroup>
  );
}

/**
 * The overview sheet's placeholder, on the same terms as the insights one: the
 * overview carries an SVG radar and a stack of metered rows, and it opens with
 * `snapRatios`, so a fixed-height placeholder cannot make the sheet jump when
 * the real body lands.
 */
export function OverviewSkeleton() {
  return (
    <SkeletonGroup label="Loading overview" className="gap-4 px-4 pb-6">
      <SkeletonBar className="h-3 w-24" />
      <View className="items-center gap-3 border border-border bg-card p-4">
        <SkeletonBar className="h-3 w-40 self-start" />
        <SkeletonBar className="h-[220px] w-[220px]" />
      </View>
      <View className="gap-2">
        <SkeletonBar className="h-3 w-16" />
        <SkeletonBar className="h-24 w-full" />
        <SkeletonBar className="h-24 w-full" />
      </View>
    </SkeletonGroup>
  );
}
