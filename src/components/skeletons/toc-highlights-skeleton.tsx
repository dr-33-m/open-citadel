import { View } from 'react-native';

import { SkeletonBar, SkeletonGroup } from '@/components/skeletons/skeleton-group';

/**
 * Stand-in for `HighlightRow`: the coloured spine down the left, one or two
 * lines of quoted text, and — on some rows — a line of tag pills.
 *
 * The spine is drawn at the row's real width (`w-1`) and full height, because
 * it is the shape that makes a highlight recognisable at a glance. Tags appear
 * on two of six rows rather than all of them, which is roughly how they fall
 * in a real book and stops the column looking like a form.
 */
const ROWS: { lines: 1 | 2; tags: boolean }[] = [
  { lines: 2, tags: false },
  { lines: 1, tags: true },
  { lines: 2, tags: false },
  { lines: 1, tags: false },
  { lines: 2, tags: true },
  { lines: 1, tags: false },
];

const SWATCHES = [0, 1, 2, 3, 4];

export function TocHighlightsSkeleton() {
  return (
    <SkeletonGroup label="Loading highlights">
      {/* The pinned search field and colour filters, at `HighlightsHeader`'s
          exact box, so the rows below it do not shift when it arrives. */}
      <View className="mx-6 mb-6 mt-4 gap-4">
        <SkeletonBar className="h-12 w-full rounded-lg" />
        <View className="flex-row items-center gap-3">
          <View className="h-7 justify-center pr-1">
            <SkeletonBar className="h-3 w-6" />
          </View>
          {SWATCHES.map((i) => (
            <SkeletonBar key={i} className="h-7 w-7 rounded-full" />
          ))}
        </View>
      </View>
      {ROWS.map((row, i) => (
        <View
          key={i}
          className="flex-row items-stretch gap-4 border-b border-surface-tertiary px-6 py-4"
        >
          <SkeletonBar className="w-1 min-h-[20px] self-stretch rounded-[2px]" />
          <View className="flex-1 gap-2">
            <SkeletonBar
              className="h-3.5 w-full"
            />
            {row.lines === 2 ? <SkeletonBar className="h-3.5 w-4/5" /> : null}
            {row.tags ? (
              <View className="flex-row gap-2 pt-1">
                <SkeletonBar className="h-5 w-16 rounded-full" />
                <SkeletonBar className="h-5 w-12 rounded-full" />
              </View>
            ) : null}
          </View>
        </View>
      ))}
    </SkeletonGroup>
  );
}
