import React from 'react';

import { ChevronRight, Newspaper } from '@/components/icons';
import { AttachmentPickerSheet } from '@/components/attachment-picker-sheet';
import { PickerRowsSkeleton } from '@/components/skeletons/picker-rows-skeleton';
import { SquareArtwork } from '@/components/square-artwork';
import { Item } from '@/components/ui/item';
import { articleMeta } from '@/features/blogs/utils/format';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { ArticleItem } from '@/services/blogs/records';
import { matchesQuery } from '@/utils/format';
import { monogramOf } from '@/utils/monogram';

const ART = 56;
const META_TEXT = { fontSize: 12, lineHeight: 16 } as const;
const TITLE_TEXT = { fontSize: 15, lineHeight: 20 } as const;
const keyOf = (article: ArticleItem) => article.id;

type ArticlePickerSheetProps = {
  visible: boolean;
  /** Undefined until the list has been read. */
  articles: ArticleItem[] | undefined;
  onSelect: (article: ArticleItem) => void;
  onClose: () => void;
};

/** One post: its picture, its blog and date, and its title, at one height so the list skims. */
const ArticleOption = React.memo(function ArticleOption({
  article,
  onSelect,
}: {
  article: ArticleItem;
  onSelect: (article: ArticleItem) => void;
}) {
  const tokens = useThemeTokens();
  return (
    <Item className="px-6 py-3" onPress={() => onSelect(article)}>
      <SquareArtwork
        uri={article.imageUrl ?? article.blogImageUrl}
        fallbackIcon={Newspaper}
        monogram={monogramOf(article.blogTitle)}
        size={ART}
        recyclingKey={article.id}
        placeholderColor={tokens['--color-surface-tertiary']}
      />
      <Item.Content>
        <Item.Description numberOfLines={1} style={META_TEXT}>
          {articleMeta(article, true)}
        </Item.Description>
        <Item.Title numberOfLines={2} style={TITLE_TEXT}>
          {article.title}
        </Item.Title>
      </Item.Content>
      <Item.Actions>
        <ChevronRight size={16} color={tokens['--color-muted-foreground']} />
      </Item.Actions>
    </Item>
  );
});

const matchesArticle = (article: ArticleItem, query: string) => matchesQuery(query, article.title, article.blogTitle);

/**
 * The post picker: a search over every post, one tap to attach a post to the
 * chat. Its rows on the shared `AttachmentPickerSheet`, as the book and
 * episode pickers are.
 */
export function ArticlePickerSheet({ visible, articles, onSelect, onClose }: ArticlePickerSheetProps) {
  const renderItem = React.useCallback(
    ({ item }: { item: ArticleItem }) => <ArticleOption article={item} onSelect={onSelect} />,
    [onSelect],
  );

  return (
    <AttachmentPickerSheet
      visible={visible}
      onClose={onClose}
      title="Pick a post"
      placeholder="Search posts…"
      items={articles}
      matches={matchesArticle}
      keyOf={keyOf}
      renderItem={renderItem}
      skeleton={<PickerRowsSkeleton label="Loading posts" />}
      emptyText="No posts yet. Follow a blog in the Library."
      noMatchText="No posts found"
    />
  );
}
