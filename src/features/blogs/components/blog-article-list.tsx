import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import React from 'react';

import { PullToSync, type PullScrollProps } from '@/components/pull-to-sync';
import { RowSeparator } from '@/components/row-separator';
import { LIST_DRAW_DISTANCE } from '@/constants/theme';
import { NEW_POSTS_PULL_LABELS, renderNewPostsIndicator } from '@/features/blogs/components/new-posts-indicator';
import type { ArticleItem } from '@/services/blogs/records';

type BlogArticleListProps = {
  articles: ArticleItem[];
  renderItem: ListRenderItem<ArticleItem>;
  header: React.ReactElement;
  empty: React.ReactElement;
  bottomPadding: number;
  /** Only a stored blog can be checked; a preview is fetched as it opens. */
  canRefresh: boolean;
  refreshing: boolean;
  onRefresh: () => void;
};

const keyExtractor = (item: ArticleItem) => item.id;

/** A blog's posts under the same pull the Blogs page has. */
export function BlogArticleList({
  articles,
  renderItem,
  header,
  empty,
  bottomPadding,
  canRefresh,
  refreshing,
  onRefresh,
}: BlogArticleListProps) {
  const renderScroller = ({ onScroll, refreshControl }: PullScrollProps) => (
    <FlashList
      data={articles}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ItemSeparatorComponent={RowSeparator}
      drawDistance={LIST_DRAW_DISTANCE}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      contentContainerStyle={{ paddingBottom: bottomPadding }}
      showsVerticalScrollIndicator={false}
      // A result is opened with one tap while the search keyboard is up, and a drag puts the keyboard away.
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      onScroll={onScroll}
      refreshControl={refreshControl}
    />
  );

  return (
    <PullToSync
      running={refreshing}
      onSync={onRefresh}
      enabled={canRefresh}
      labels={NEW_POSTS_PULL_LABELS}
      renderIndicator={renderNewPostsIndicator}
      renderScroller={renderScroller}
    />
  );
}
