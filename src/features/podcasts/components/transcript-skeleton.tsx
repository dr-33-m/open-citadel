import React from 'react';
import { View } from 'react-native';

import { SkeletonBar, SkeletonGroup } from '@/components/skeletons/skeleton-group';

const BLOCKS = [3, 2, 4, 2, 3];

/** A transcript while it loads: speaker labels and lines of words, one animated node for all of them. */
export function TranscriptSkeleton() {
  return (
    <SkeletonGroup label="Loading the transcript" className="gap-6 px-6 pt-3">
      {BLOCKS.map((lines, block) => (
        <View key={block} className="gap-2">
          <SkeletonBar className="h-3 w-28" />
          {Array.from({ length: lines }, (_, i) => (
            <SkeletonBar key={i} className={i === lines - 1 ? 'h-4 w-3/5' : 'h-4 w-full'} />
          ))}
        </View>
      ))}
    </SkeletonGroup>
  );
}
