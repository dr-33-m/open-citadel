import React from 'react';

import type { WholePosts } from '@/db/schema';
import { useOpenArticle, type OpenablePost } from '@/features/blogs/hooks/use-open-article';
import { useWholePosts } from '@/features/blogs/hooks/use-whole-posts';

/**
 * Opening a post anywhere: `useOpenArticle`, with the question a
 * summary-only blog asks the first time one of its posts is opened, and the
 * way back to what the reader was doing once they answer. One copy, so a
 * post opened from a list and from a chat about it cannot come to go to
 * different places. Draw `wholePosts` with `WholePostsSheet`.
 */
export function useOpenPost() {
  const asked = useWholePosts();
  const opener = useOpenArticle(asked.ask);
  const { choose, visible, copy, close, change } = asked;
  const { openArticle } = opener;

  /** Saves the answer, then carries on: opens the post, or hands a listen to `listen`. */
  const answer = React.useCallback(
    (mode: WholePosts, listen?: (post: OpenablePost) => void) =>
      void choose(mode).then((resume) => {
        if (resume?.intent === 'open') void openArticle(resume.post);
        else if (resume?.intent === 'listen') listen?.(resume.post);
      }),
    [choose, openArticle],
  );
  const onChoose = React.useCallback((mode: WholePosts) => answer(mode), [answer]);

  const wholePosts = React.useMemo(() => ({ visible, copy, onChoose, onClose: close }), [visible, copy, onChoose, close]);

  return { ...opener, answer, wholePosts, changeWholePosts: change };
}
