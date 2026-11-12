import React from 'react';

import { useSamwellReadiness } from '@/features/chat/hooks/use-samwell-readiness';
import { useAfterFirstPaint } from '@/navigation/use-after-first-paint';
import { useBooksStore } from '@/stores/books';
import { useCompassStore } from '@/stores/compass';

/**
 * What the Samwell page reads once it has painted: the books (a chat opened
 * before the Library was visited could not resolve its book's cover without
 * them) and, when there is a cloud to reach, Compass. Database and network
 * reads, so kept off the push.
 */
export function useSamwellWarmup() {
  const painted = useAfterFirstPaint();
  const cloudReady = useSamwellReadiness().cloudBlocker === null;
  const loadCompass = useCompassStore((s) => s.loadCompass);

  React.useEffect(() => {
    if (!painted) return;
    if (useBooksStore.getState().books.length === 0) void useBooksStore.getState().loadBooks();
  }, [painted]);

  React.useEffect(() => {
    if (painted && cloudReady) void loadCompass();
  }, [painted, cloudReady, loadCompass]);
}
