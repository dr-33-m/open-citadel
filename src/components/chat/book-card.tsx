import { eq } from 'drizzle-orm';
import { BookOpen } from '@/components/icons';
import React from 'react';

import { MediaCard } from '@/components/chat/media-card';
import { db } from '@/db/client';
import { books, readingProgress } from '@/db/schema';

interface BookCardProps {
  id: string;
  onNavigate?: (bookId: string) => void;
}

interface CardData {
  title: string;
  author: string;
  coverUrl: string | null;
  status: string | null;
  percentage: number | null;
}

/** Where the reader is with a book, in a few words. */
function bookStatus(data: CardData): string | null {
  if (data.status === 'reading' && data.percentage != null) return `${Math.round(data.percentage * 100)}% read`;
  if (data.status === 'archived') return 'Finished';
  if (data.status === 'queued') return 'In your queue';
  return null;
}

/**
 * A book Samwell named, shown as the book rather than as its title.
 *
 * Same role in the transcript as {@link HighlightCard}: the reader recognises
 * their own shelf by its covers, and a recommendation they can see is one they
 * can act on.
 */
export const BookCard = React.memo(function BookCard({ id, onNavigate }: BookCardProps) {
  /* Read during render. See the note in `highlight-card` — an effect here
     cost a frame and a 0-to-full-height jump mid-reply. */
  const data = React.useMemo<CardData | null>(() => {
    const row = db
      .select({
        title: books.title,
        author: books.author,
        coverUrl: books.coverUrl,
        status: books.status,
        percentage: readingProgress.percentage,
      })
      .from(books)
      .leftJoin(readingProgress, eq(readingProgress.bookId, books.id))
      .where(eq(books.id, id))
      .get();

    return row ?? null;
  }, [id]);
  const onPress = React.useMemo(() => (onNavigate ? () => onNavigate(id) : undefined), [onNavigate, id]);

  // A book that is no longer in the library leaves no trace: better a missing
  // card than a card for something the reader cannot open.
  if (!data) return null;

  return (
    <MediaCard
      id={id}
      coverUri={data.coverUrl}
      coverShape="book"
      FallbackIcon={BookOpen}
      title={data.title}
      subtitle={data.author}
      status={bookStatus(data)}
      onPress={onPress}
    />
  );
});
