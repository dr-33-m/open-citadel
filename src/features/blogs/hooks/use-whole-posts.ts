import React from 'react';

import type { WholePosts } from '@/db/schema';
import type { AskWholePosts, ArticleIntent, OpenablePost } from '@/features/blogs/hooks/use-open-article';
import { wholePostsAsk, type WholePostsAskCopy } from '@/features/blogs/utils/whole-posts';
import { track } from '@/lib/observe';
import { invalidateBlogLibrary } from '@/query-manager/blogs';
import type { WholePostsAsk } from '@/services/blogs/article-book';
import { setBlogWholePosts } from '@/services/blogs/blogs';

type Asking = { blog: WholePostsAsk; post?: OpenablePost; intent?: ArticleIntent };

/** What the reader was doing when asked, to carry on with: null when asked from the blog's page. */
export type Resume = { post: OpenablePost; intent: ArticleIntent } | null;

/**
 * The question of how a summary-only blog is read (`WholePosts`): put up the
 * first time one of its posts is opened (`ask`), or from the blog's page to
 * change it (`change`). `choose` saves the answer and hands back what the
 * reader was doing, for the caller to carry on with.
 */
export function useWholePosts() {
  const [asking, setAsking] = React.useState<Asking | null>(null);
  const [visible, setVisible] = React.useState(false);

  const open = React.useCallback((next: Asking) => {
    setAsking(next);
    setVisible(true);
  }, []);
  const ask: AskWholePosts = open;
  const change = React.useCallback((blog: WholePostsAsk) => open({ blog }), [open]);
  // The question stays drawn while the sheet slides away.
  const close = React.useCallback(() => setVisible(false), []);

  const choose = React.useCallback(
    async (mode: WholePosts): Promise<Resume> => {
      setVisible(false);
      if (!asking) return null;
      await setBlogWholePosts(asking.blog.blogId, mode);
      track({ name: 'post.whole_posts', attributes: { mode } });
      invalidateBlogLibrary();
      return asking.post && asking.intent ? { post: asking.post, intent: asking.intent } : null;
    },
    [asking],
  );

  const copy: WholePostsAskCopy | null = React.useMemo(
    () => (asking ? wholePostsAsk(asking.blog.blogTitle, asking.blog.host, !asking.post) : null),
    [asking],
  );

  return { ask, change, choose, visible, copy, close };
}
