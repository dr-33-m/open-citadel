import { View } from 'react-native';

import { SkeletonBar, SkeletonGroup } from '@/components/skeletons/skeleton-group';
import { spacing } from '@/constants/theme';

/**
 * Stand-in for `ChapterRow`: one title line per row, indented by depth, with
 * no media block.
 *
 * The depths are a fixed pattern rather than a flat list, because a table of
 * contents is a tree and a column of identical bars does not read as one. The
 * widths vary with it — a nested chapter title is usually shorter than the
 * part heading above it.
 */
const ROWS: { depth: 0 | 1; width: string }[] = [
  { depth: 0, width: 'w-3/5' },
  { depth: 1, width: 'w-4/5' },
  { depth: 1, width: 'w-2/3' },
  { depth: 0, width: 'w-1/2' },
  { depth: 1, width: 'w-3/4' },
  { depth: 1, width: 'w-3/5' },
  { depth: 1, width: 'w-5/6' },
  { depth: 0, width: 'w-2/5' },
  { depth: 1, width: 'w-2/3' },
  { depth: 1, width: 'w-4/5' },
];

export function TocChaptersSkeleton() {
  return (
    <SkeletonGroup label="Loading contents">
      {ROWS.map((row, i) => (
        <View
          key={i}
          className="py-4 pr-6"
          style={{ paddingLeft: spacing[6] + row.depth * spacing[5] }}
        >
          <SkeletonBar
            className={`h-4 ${row.width}`}
          />
        </View>
      ))}
    </SkeletonGroup>
  );
}
