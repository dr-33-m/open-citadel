import React from 'react';
import { View } from 'react-native';

import { SkeletonBar, SkeletonGroup } from '@/components/skeletons/skeleton-group';

/** The Listen sheet's two figures while the book is read into the index: two tiles, one animated node. */
export function ListenStatsSkeleton() {
  return (
    <SkeletonGroup label="Working out the time left" className="flex-row gap-4 self-stretch">
      {[0, 1].map((tile) => (
        <View key={tile} className="flex-1 gap-2 border border-border p-4">
          <SkeletonBar className="h-8 w-20" />
          <SkeletonBar className="h-3 w-24" />
        </View>
      ))}
    </SkeletonGroup>
  );
}
