import React from 'react';

import { ListEmpty } from '@/components/list-empty';
import { TransitionFlashList } from '@/components/navigation/transition-scroll';
import { PageFade } from '@/components/scroll-fades';
import { LIST_DRAW_DISTANCE } from '@/constants/theme';
import { DiscoverRow } from '@/features/podcasts/components/discover-row';
import type { FollowedCheck } from '@/features/podcasts/hooks/use-explore';
import { discoveredKey } from '@/features/podcasts/utils/show-tiles';
import type { DiscoveredShow } from '@/services/podcasts/discovery';

type ExploreResultsProps = {
  results: DiscoveredShow[];
  emptyText: string | null;
  isFollowed: FollowedCheck;
  bottomPadding: number;
  onOpen: (id: string) => void;
};

/** What a search of Apple's directory found. */
export function ExploreResults({ results, emptyText, isFollowed, bottomPadding, onOpen }: ExploreResultsProps) {
  const renderResult = React.useCallback(
    ({ item }: { item: DiscoveredShow }) => (
      <DiscoverRow
        id={discoveredKey(item)}
        title={item.title}
        subtitle={item.author}
        artworkUrl={item.artworkUrl}
        following={isFollowed(item)}
        onPress={onOpen}
      />
    ),
    [isFollowed, onOpen],
  );
  return (
    <PageFade>
      <TransitionFlashList
        data={results}
        keyExtractor={discoveredKey}
        renderItem={renderResult}
        drawDistance={LIST_DRAW_DISTANCE}
        contentContainerStyle={{ paddingBottom: bottomPadding }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<ListEmpty text={emptyText} />}
      />
    </PageFade>
  );
}
