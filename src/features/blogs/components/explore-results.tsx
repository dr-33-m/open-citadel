import React from 'react';

import { ListEmpty } from '@/components/list-empty';
import { TransitionFlashList } from '@/components/navigation/transition-scroll';
import { PageFade } from '@/components/scroll-fades';
import { LIST_DRAW_DISTANCE } from '@/constants/theme';
import { AddressRow } from '@/features/blogs/components/address-row';
import { DirectoryRow } from '@/features/blogs/components/directory-row';
import type { DirectoryBlog } from '@/services/blogs/directory';

type ExploreResultsProps = {
  results: DirectoryBlog[];
  followed: Set<string>;
  /** What was typed, when it reads as an address: offered first. */
  address: string | null;
  emptyText: string | null;
  bottomPadding: number;
  onOpen: (blog: DirectoryBlog) => void;
  onOpenAddress: () => void;
};

const keyOf = (blog: DirectoryBlog) => blog.feedUrl;

/** The directory's blogs matching a search, under the typed address when there is one. */
export function ExploreResults({ results, followed, address, emptyText, bottomPadding, onOpen, onOpenAddress }: ExploreResultsProps) {
  const renderItem = React.useCallback(
    ({ item }: { item: DirectoryBlog }) => <DirectoryRow blog={item} following={followed.has(item.feedUrl)} onPress={onOpen} />,
    [followed, onOpen],
  );
  const header = address ? <AddressRow address={address} onPress={onOpenAddress} /> : null;
  const empty = emptyText ? <ListEmpty text={emptyText} /> : null;

  return (
    <PageFade>
      <TransitionFlashList
        data={results}
        keyExtractor={keyOf}
        renderItem={renderItem}
        extraData={followed}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        drawDistance={LIST_DRAW_DISTANCE}
        contentContainerStyle={{ paddingBottom: bottomPadding }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
    </PageFade>
  );
}
