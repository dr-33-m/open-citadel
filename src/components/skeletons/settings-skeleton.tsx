import { View } from 'react-native';

import { SkeletonBar, SkeletonGroup } from '@/components/skeletons/skeleton-group';

/**
 * Stand-in for the Settings body, section by section.
 *
 * Deliberately not a loop over identical rows: these four groups do not share a
 * shape. Profile is a field with a trailing rank badge, Appearance is a card
 * with a switch, Books is an icon beside a wrapped paragraph, and Samwell is a
 * label-and-subtitle over two side-by-side mode cards with a panel under them.
 * A placeholder that drew them all as one row would be describing a screen this
 * app does not have, and the mismatch shows at exactly the moment it dissolves.
 *
 * Only what mounts above the fold is drawn — the sections below are gated on
 * settle and were never part of the first paint, so standing in for them would
 * invent a wait that does not happen.
 */

/** The gold letter-spaced group heading. */
function GroupLabel({ width = 'w-24' }: { width?: string }) {
  return <SkeletonBar className={`h-3 ${width}`} />;
}

function Divider() {
  return <View className="h-px bg-surface-tertiary mt-4" />;
}

/** One of the two Samwell mode cards: icon and title, then a wrapped blurb. */
function ModeCardSkeleton() {
  return (
    <View className="flex-1 gap-2 border border-surface-tertiary bg-card p-4">
      <View className="flex-row items-center gap-3">
        <SkeletonBar className="h-9 w-9 rounded" />
        <SkeletonBar className="h-3.5 w-14" />
      </View>
      <SkeletonBar className="h-3 w-full" />
      <SkeletonBar className="h-3 w-3/5" />
    </View>
  );
}

export function SettingsSkeleton() {
  return (
    <SkeletonGroup label="Loading settings">
      {/* PROFILE — name field with the rank badge at its end. */}
      <View className="mt-6 gap-4">
        <GroupLabel />
        <View className="flex-row items-center gap-3 bg-muted px-4 py-4">
          <SkeletonBar className="h-6 w-6 rounded" />
          <SkeletonBar className="h-3.5 flex-1" />
          <SkeletonBar className="h-7 w-7" />
        </View>
      </View>

      {/* APPEARANCE — one card, icon and label, switch on the right. */}
      <Divider />
      <View className="mt-8 gap-4">
        <GroupLabel width="w-28" />
        <View className="flex-row items-center justify-between bg-card p-4">
          <View className="flex-row items-center gap-3">
            <SkeletonBar className="h-9 w-9 rounded" />
            <SkeletonBar className="h-3.5 w-24" />
          </View>
          <SkeletonBar className="h-7 w-12 rounded-full" />
        </View>
      </View>

      {/* BOOKS — icon beside a paragraph that wraps to three lines. */}
      <Divider />
      <View className="mt-8 gap-4">
        <GroupLabel width="w-16" />
        <View className="flex-row items-start gap-3 bg-card p-4">
          <SkeletonBar className="h-9 w-9 rounded" />
          <View className="flex-1 gap-2">
            <SkeletonBar className="h-3 w-full" />
            <SkeletonBar className="h-3 w-full" />
            <SkeletonBar className="h-3 w-2/3" />
          </View>
        </View>
      </View>

      {/* SAMWELL — label over a subtitle, then the two mode cards side by side,
          then the engine panel beneath them. */}
      <Divider />
      <View className="mt-8 gap-4">
        <View className="gap-1">
          <GroupLabel width="w-40" />
          <SkeletonBar className="h-3 w-32" />
        </View>
        <View className="flex-row gap-3">
          <ModeCardSkeleton />
          <ModeCardSkeleton />
        </View>
        <View className="gap-3 bg-card p-4">
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1 gap-1">
              <SkeletonBar className="h-3.5 w-2/3" />
              <SkeletonBar className="h-3 w-2/5" />
            </View>
            <SkeletonBar className="h-8 w-20" />
          </View>
        </View>
      </View>
    </SkeletonGroup>
  );
}
