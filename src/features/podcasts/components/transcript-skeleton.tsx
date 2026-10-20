import React from 'react';
import { View } from 'react-native';

import { SkeletonBar, SkeletonGroup } from '@/components/skeletons/skeleton-group';

/** How many rows of words each line wraps to. */
const LINES = [2, 1, 3, 2, 1, 2, 3, 2];

/** A transcript while it loads: a speaker's name, then lines with their times beside them, one animated node for all of them. */
export function TranscriptSkeleton() {
  return (
    <SkeletonGroup label="Loading the transcript" className="gap-5 px-6 pt-6">
      <SkeletonBar className="ml-[52px] h-3 w-28" />
      {LINES.map((rows, line) => (
        <View key={line} className="flex-row gap-3">
          <SkeletonBar className="mt-1 h-3 w-9" />
          <View className="flex-1 gap-2">
            {Array.from({ length: rows }, (_, i) => (
              <SkeletonBar key={i} className={i === rows - 1 ? 'h-4 w-3/5' : 'h-4 w-full'} />
            ))}
          </View>
        </View>
      ))}
    </SkeletonGroup>
  );
}
