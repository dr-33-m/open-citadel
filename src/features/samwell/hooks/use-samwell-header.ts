import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React from 'react';

import { useOpenPost } from '@/features/blogs/hooks/use-open-post';
import { useSamwellReadiness } from '@/features/chat/hooks/use-samwell-readiness';
import { ATTACHMENT_OPEN_LABEL, attachmentOpenTarget } from '@/features/chat/utils/attachment-open';
import { useOpenReader } from '@/features/library/hooks/use-open-reader';
import { useSamwellAttachment } from '@/features/samwell/hooks/use-samwell-attachment';
import { useSamwellRoutes } from '@/features/samwell/hooks/use-samwell-routes';
import { createArticleOfBookQueryOptions } from '@/query-manager/blogs';
import { useChatStore } from '@/stores/chat';
import { useSamwellUiStore } from '@/stores/samwell-ui';

/**
 * The bar over the conversation: its name once it has one, the book, post or
 * episode it is about, and the way back to the Library. A post opens as it
 * would from its blog, so the question a summary-only blog asks can come up
 * here too: draw `wholePosts` with `WholePostsSheet`.
 *
 * Its own subscriptions, so a token, a keystroke or a sheet does not redraw
 * it; it changes when the conversation's name or what it holds does.
 */
export function useSamwellHeader() {
  const router = useRouter();
  const routes = useSamwellRoutes();
  const onWakeSamwell = useSamwellReadiness().initContext;
  const openSheet = useSamwellUiStore((s) => s.openSheet);

  const title = useChatStore((s) => s.activeSession?.title ?? null);
  const bookId = useChatStore((s) => s.activeSession?.bookId ?? null);
  const locator = useChatStore((s) => s.activeSession?.contextLocator ?? null);
  const attachment = useSamwellAttachment();

  const openReader = useOpenReader();
  const { openArticle, wholePosts } = useOpenPost();
  const isPost = attachment.kind === 'article' && bookId !== null;
  const post = useQuery(createArticleOfBookQueryOptions(bookId ?? '', { enabled: isPost })).data ?? null;

  const target = attachment.kind
    ? attachmentOpenTarget({
        kind: attachment.kind,
        episode: attachment.episode !== null,
        post: isPost && post !== null,
        passage: locator !== null,
      })
    : null;

  const onOpenAttachment = React.useMemo(() => {
    if (target === 'transcript') return () => openSheet('episode-transcript');
    if (!bookId) return undefined;
    if (target === 'passage' && locator) {
      return () => router.push({ pathname: '/reader/[id]', params: { id: bookId, locator } });
    }
    if (target === 'book') return () => openReader(bookId);
    if (target === 'post' && post) return () => void openArticle(post);
    return undefined;
  }, [target, bookId, locator, post, openSheet, openReader, openArticle, router]);

  const shared = { onBack: routes.library, backLabel: 'Library', onWakeSamwell, onOpenSettings: routes.settings };

  const held = React.useMemo(
    () =>
      attachment.kind && attachment.title
        ? {
            kind: attachment.kind,
            title: attachment.title,
            cover: attachment.cover,
            openLabel: target ? ATTACHMENT_OPEN_LABEL[target] : null,
          }
        : null,
    [attachment.kind, attachment.title, attachment.cover, target],
  );

  // Null until the conversation has a name of its own: a picked book is not
  // yet a chat, so the bar still centres and the book waits in the toolbox.
  return { header: { ...shared, title, attachment: held, onOpenAttachment }, wholePosts };
}
