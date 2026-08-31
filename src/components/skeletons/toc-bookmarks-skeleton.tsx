import { View } from 'react-native';

import { SkeletonBar, SkeletonGroup } from '@/components/skeletons/skeleton-group';

/**
 * Stand-in for `BookmarkRow`: the bookmark icon on the left, a chapter line
 * and the smaller date line under it, and — on some rows — a saved note.
 *
 * Top-aligned like the real row, which pins the icon to the first line rather
 * than centring it against a row whose height varies with its note.
 */
const ROWS: { note: boolean }[] = [
  { note: false },
  { note: true },
  { note: false },
  { note: false },
  { note: true },
  { note: false },
];

export function TocBookmarksSkeleton() {
  return (
    <SkeletonGroup label="Loading bookmarks">
      {ROWS.map((row, i) => (
        <View
          key={i}
          className="flex-row items-start gap-4 border-b border-surface-tertiary px-6 py-4"
        >
          <SkeletonBar className="h-5 w-5 rounded" />
          <View className="flex-1 gap-2">
            <SkeletonBar
              className="h-3.5 w-2/3"
            />
            <SkeletonBar className="h-3 w-2/5" />
            {row.note ? <SkeletonBar className="h-3 w-5/6" /> : null}
          </View>
        </View>
      ))}
    </SkeletonGroup>
  );
}
