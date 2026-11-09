import { useRouter } from 'expo-router';
import React from 'react';

import { MicSignal } from '@/components/icons';
import { useSamwellReadiness } from '@/features/chat/hooks/use-samwell-readiness';
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

  const onOpenBook = React.useMemo(() => {
    // An episode chat's badge opens its transcript; a passage chat's, the passage.
    if (attachment.episode) return () => openSheet('episode-transcript');
    if (bookId && locator) return () => router.push({ pathname: '/reader/[id]', params: { id: bookId, locator } });
    return undefined;
  }, [attachment.episode, bookId, locator, openSheet, router]);

  const shared = { onBack: routes.library, backLabel: 'Library', onWakeSamwell, onOpenSettings: routes.settings };

  // Null until the conversation has a name of its own: a picked book is not
  // yet a chat, so the bar still centres and the book rides beneath.
  return {
    ...shared,
    title,
    bookTitle: attachment.title,
    bookIcon: attachment.episode ? MicSignal : undefined,
    onOpenBook,
  };
}
