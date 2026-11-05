import React from 'react';
import { View } from 'react-native';

import { SkeletonBar, SkeletonGroup } from '@/components/skeletons/skeleton-group';

const CARDS = [0, 1, 2];

/**
 * A page of Settings on its way in: a label and a card of rows, three times,
 * at the sizes the controls are drawn. One animated node for the lot.
 */
export function SettingsPaneSkeleton() {
  return (
    <SkeletonGroup label="Opening settings" className="gap-8">
      {CARDS.map((card) => (
        <View key={card} className="gap-3">
          <SkeletonBar className="h-3 w-1/3" />
          <SkeletonBar className="h-20 w-full" />
          <SkeletonBar className="h-14 w-full" />
        </View>
      ))}
    </SkeletonGroup>
  );
}
