import React from 'react';
import { View } from 'react-native';

import { RowSeparator } from '@/components/row-separator';
import { SkeletonBar, SkeletonGroup } from '@/components/skeletons/skeleton-group';
import { BOOK_ROW_COVER } from '@/features/library/components/book-row';

const ROWS = [0, 1, 2, 3, 4];

/**
 * A list of books before it has landed: rows the height of real ones (the
 * cover beside title and author, the menu at the foot), in one
 * `SkeletonGroup` so the list pulses as one node.
 */
export function BookListSkeleton() {
  return (
    <SkeletonGroup label="Loading books">
      {ROWS.map((i) => (
        <View key={i}>
          {i > 0 ? <RowSeparator /> : null}
          <View className="flex-row gap-3 px-6 py-5">
            <View className="bg-skeleton" style={BOOK_ROW_COVER} />
            <View className="flex-1 justify-between">
              <View className="gap-2">
                <SkeletonBar className="h-4 w-11/12" />
                <SkeletonBar className="h-4 w-3/5" />
                <SkeletonBar className="h-3 w-2/5" />
              </View>
              <View className="h-10" />
            </View>
          </View>
        </View>
      ))}
    </SkeletonGroup>
  );
}
