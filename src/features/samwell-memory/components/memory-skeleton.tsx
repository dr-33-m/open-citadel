import React from 'react';
import { View } from 'react-native';

import { SkeletonBar, SkeletonGroup } from '@/components/skeletons/skeleton-group';
import { contentColumn } from '@/constants/theme';

const ROWS = [0, 1, 2, 3, 4];

/** The shape of the notes, one animated node for the lot, while the drawer rises. */
export function MemorySkeleton() {
  return (
    <SkeletonGroup>
      <View className="gap-6 px-6 pt-8" style={contentColumn}>
        {ROWS.map((row) => (
          <View key={row} className="gap-2">
            <SkeletonBar className="h-4 w-full" />
            <SkeletonBar className="h-4 w-2/3" />
          </View>
        ))}
      </View>
    </SkeletonGroup>
  );
}
