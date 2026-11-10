import { useRouter } from 'expo-router';
import React from 'react';

import { useSamwellReadiness } from '@/features/chat/hooks/use-samwell-readiness';
import { ATTACHMENT_OPEN_LABEL, attachmentOpenTarget } from '@/features/chat/utils/attachment-open';
import { useOpenReader } from '@/features/library/hooks/use-open-reader';
import { useSamwellAttachment } from '@/features/samwell/hooks/use-samwell-attachment';
import { useSamwellRoutes } from '@/features/samwell/hooks/use-samwell-routes';
import { useChatStore } from '@/stores/chat';
import { useSamwellUiStore } from '@/stores/samwell-ui';

/**
 * The bar over the conversation: its name once it has one, the book, post or
 * episode it is about, and the way back to the Library.
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

  const target = attachment.kind
    ? attachmentOpenTarget({ kind: attachment.kind, episode: attachment.episode !== null, passage: locator !== null })
    : null;

  const onOpenAttachment = React.useMemo(() => {
    if (target === 'transcript') return () => openSheet('episode-transcript');
    if (!bookId) return undefined;
    if (target === 'passage' && locator) {
      return () => router.push({ pathname: '/reader/[id]', params: { id: bookId, locator } });
    }
    if (target === 'book') return () => openReader(bookId);
    return undefined;
  }, [target, bookId, locator, openSheet, openReader, router]);

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
  return { ...shared, title, attachment: held, onOpenAttachment };
}
