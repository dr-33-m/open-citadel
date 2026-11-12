import React from 'react';

import type { BlogHeroProps } from '@/features/blogs/components/blog-hero';
import { wholePostsLine } from '@/features/blogs/utils/whole-posts';
import type { WholePostsAsk } from '@/services/blogs/article-book';
import type { ArticleItem, Blog } from '@/services/blogs/records';
import { permissionsFor } from '@/services/publishers';

type WholePostsLineInput = {
  blog: Blog | null | undefined;
  siteUrl: string | null;
  host: string | null;
  articles: ArticleItem[] | undefined;
  /** Puts up the question (`useArticleActions`). */
  change: (blog: WholePostsAsk) => void;
};

/**
 * The blog page's line on where a summary-only blog's posts are read, and the
 * way to change it. Said only for a blog whose feed carries openings, which is
 * when there is a choice; held once seen, so the UNREAD filter showing none of
 * those posts does not take it away.
 */
export function useWholePostsLine({ blog, siteUrl, host, articles, change }: WholePostsLineInput): BlogHeroProps['wholePosts'] {
  const [openings, setOpenings] = React.useState(false);
  if (!openings && articles?.some((a) => a.feedExcerpt === true)) setOpenings(true);

  const blogId = blog?.id ?? null;
  const blogTitle = blog?.title ?? null;
  const mode = blog?.wholePosts ?? null;
  return React.useMemo(() => {
    if (!openings || !blogId || !blogTitle) return null;
    const named = host ?? blogTitle;
    const line = wholePostsLine({ mode, allowed: permissionsFor(siteUrl).wholePosts, host: named });
    const ask = { blogId, blogTitle, host: named };
    return { text: line.text, mark: line.mark, onPress: line.canChange ? () => change(ask) : null };
  }, [openings, blogId, blogTitle, mode, siteUrl, host, change]);
}
