import React from 'react';

import type { BookKind } from '@/db/schema';
import { useEpisodeOfBook } from '@/features/podcasts/hooks/use-episode-of-book';
import { useBookCover } from '@/hooks/use-book-cover';
import { playEpisodeFrom } from '@/services/podcasts/player';
import { useBooksStore } from '@/stores/books';
import { useChatStore } from '@/stores/chat';
import { useSamwellSessionStore } from '@/stores/samwell-session';

export type SamwellAttachment = {
  /** The session's book, post or episode, or the pick waiting for the first message. */
  id: string | null;
  kind: BookKind | null;
  title: string | null;
  cover: string | null;
  /** An episode chat: its transcript opens from the header, and cited times play it. */
  episode: { episodeId: string; line: string } | null;
};

/**
 * What the chat holds, as the header, the toolbox and the transcript each
 * draw it.
 *
 * A book's cover is looked up by id from the library rather than by
 * subscribing to the whole of it, which the page used to do: every library
 * change (a cover arriving, a progress write) redrew the Samwell page.
 */
export function useSamwellAttachment(): SamwellAttachment {
  const session = useChatStore((s) => s.activeSession);
  const pendingBook = useSamwellSessionStore((s) => s.pendingBook);

  const id = session ? session.bookId : (pendingBook?.id ?? null);
  const kind = session ? session.bookKind : (pendingBook?.kind ?? null);
  const title = session?.bookTitle ?? pendingBook?.title ?? null;

  const libraryCover = useBooksStore((s) => (kind === 'book' && id ? (s.books.find((b) => b.id === id)?.coverUrl ?? null) : null));
  // A post's or an episode's cover is on its own `books` row, not in the library list.
  const copyCover = useBookCover(kind && kind !== 'book' ? id : null);
  const episode = useEpisodeOfBook(kind === 'episode' ? id : null);

  return React.useMemo(
    () => ({ id, kind, title, cover: kind === 'book' ? libraryCover : copyCover, episode }),
    [id, kind, title, libraryCover, copyCover, episode],
  );
}

/** In an episode chat, a cited time plays the episode from there. */
export function useEpisodeTimePlayer(episode: SamwellAttachment['episode']) {
  return React.useMemo(
    () => (episode ? (seconds: number) => void playEpisodeFrom(episode.episodeId, seconds) : null),
    [episode],
  );
}
