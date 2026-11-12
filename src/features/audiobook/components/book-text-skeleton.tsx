import React from 'react';
import { View } from 'react-native';

import { SkeletonBar, SkeletonGroup } from '@/components/skeletons/skeleton-group';

/** How many lines each paragraph wraps to. */
const PARAGRAPHS = [4, 3, 5, 2, 4];

/** A chapter's text while it is read: paragraphs of serif lines, one animated node for all of them. */
export function BookTextSkeleton() {
  return (
    <SkeletonGroup label="Loading the text" className="gap-6 px-6 pt-6">
      {PARAGRAPHS.map((lines, p) => (
        <View key={p} className="gap-2.5">
          {Array.from({ length: lines }, (_, i) => (
            <SkeletonBar key={i} className={i === lines - 1 ? 'h-4 w-2/3' : 'h-4 w-full'} />
          ))}
        </View>
      ))}
    </SkeletonGroup>
  );
}
