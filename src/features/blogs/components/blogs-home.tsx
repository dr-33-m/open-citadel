import React from 'react';

import { Handover } from '@/components/navigation/handover';
import { PagedRow } from '@/components/paged-row';
import { PullToSync } from '@/components/pull-to-sync';
import { ShelfSection } from '@/components/shelf-section';
import { FAVORITE_BADGE, FINISHED_BADGE, type TileBadgeIcon } from '@/components/tile-badge';
import { layout } from '@/constants/theme';
import { ArticleContinueCard } from '@/features/blogs/components/article-continue-card';
import { ArticleShelf } from '@/features/blogs/components/article-shelf';
import { BlogShelf } from '@/features/blogs/components/blog-shelf';
import { BlogShelvesSkeleton } from '@/features/blogs/components/blog-shelves-skeleton';
import { NEW_POSTS_PULL_LABELS, renderNewPostsIndicator } from '@/features/blogs/components/new-posts-indicator';
import { SECTION_TITLES } from '@/features/blogs/utils/sections';
import type { BlogSection, BlogsHomeData } from '@/query-manager/blogs';
import type { ArticleItem } from '@/services/blogs/records';

type BlogsHomeProps = {
  home: BlogsHomeData;
  /** The side has finished appearing: the shelves under the Continue card mount. */
  landed: boolean;
  refreshing: boolean;
  bottomPadding: number;
  onRefresh: () => void;
  onViewAll: (section: BlogSection) => void;
  onOpenArticle: (article: ArticleItem) => void;
  onOpenBlog: (blogId: string) => void;
  onArticleMenu: (article: ArticleItem) => void;
};

const articleKey = (article: ArticleItem) => article.id;

/** The marks the books' shelves of the same names carry. */
const SHELF_BADGES: Partial<Record<BlogSection, TileBadgeIcon>> = { favorites: FAVORITE_BADGE, finished: FINISHED_BADGE };

/**
 * The shelves, in the order a reader reaches for them: what they are in the
 * middle of, what they chose to read next, what is new, what they kept, and
 * what they have read. The queue leads the new posts as Up Next leads Just
 * Arrived on the podcasts side; the rest are named and ordered as the books'
 * are.
 */
const ORDER: BlogSection[] = ['continue', 'queue', 'latest', 'favorites', 'blogs', 'finished'];

/**
 * The blogs side of the Library, laid out the way the podcasts side is:
 * shelves, each with a "View all", only where there is something on them.
 */
export function BlogsHome({
  home,
  landed,
  refreshing,
  bottomPadding,
  onRefresh,
  onViewAll,
  onOpenArticle,
  onOpenBlog,
  onArticleMenu,
}: BlogsHomeProps) {
  const { shelves, blogs } = home;
  const shown = ORDER.filter((key) => (key === 'blogs' ? blogs.length > 0 : shelves[key].length > 0));
  const renderContinue = (article: ArticleItem) => (
    <ArticleContinueCard article={article} onPress={onOpenArticle} onLongPress={onArticleMenu} />
  );
  // What each shelf holds: the part-read posts as the page's hero, in the
  // carousel the books' Continue Reading and Continue Listening use; blogs as tiles;
  // the rest as a row of posts.
  const shelfContent = (key: BlogSection) => {
    if (key === 'continue') return <PagedRow items={shelves.continue} keyOf={articleKey} renderPage={renderContinue} />;
    if (key === 'blogs') return <BlogShelf blogs={blogs} onPress={onOpenBlog} />;
    return (
      <ArticleShelf
        articles={shelves[key]}
        onPress={onOpenArticle}
        onLongPress={onArticleMenu}
        badgeIcon={SHELF_BADGES[key]}
      />
    );
  };
  // The Continue card is one plain card over cached data, drawn with the side
  // as it appears. The shelves under it are horizontal lists and wait for the
  // side to land. None has an entrance of its own: the side's fade brings the
  // card, and the skeleton fading off the shelves is theirs (a fade-in of
  // their own under it left a moment with neither on screen).
  const [lead, ...rest] = shown;
  const drawnAtOnce = lead === 'continue';
  const later = drawnAtOnce ? rest : shown;
  const renderSection = (key: BlogSection) => (
    <ShelfSection
      key={key}
      title={SECTION_TITLES[key]}
      onViewAll={() => onViewAll(key)}
      // The carousel's pages own the window width and cap their own cards.
      capped={key !== 'continue'}
    >
      {shelfContent(key)}
    </ShelfSection>
  );

  return (
    <PullToSync
      running={refreshing}
      onSync={onRefresh}
      labels={NEW_POSTS_PULL_LABELS}
      renderIndicator={renderNewPostsIndicator}
      contentContainerClassName="pt-6"
      contentContainerStyle={{ paddingBottom: layout.scrollBottom + bottomPadding }}
    >
      {drawnAtOnce ? renderSection('continue') : null}
      <Handover fill={false} ready={landed} skeleton={<BlogShelvesSkeleton />}>
        {later.map(renderSection)}
      </Handover>
    </PullToSync>
  );
}
