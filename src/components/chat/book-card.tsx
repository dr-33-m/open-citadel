import { Image } from 'expo-image';
import { eq } from 'drizzle-orm';
import { BookOpen } from '@/components/icons';
import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { db } from '@/db/client';
import { books, readingProgress } from '@/db/schema';
import { asColor, COVER_PLACEHOLDER_BLURHASH } from '@/utils/colors';

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

/**
 * A book Samwell named, shown as the book rather than as its title.
 *
 * Same role in the transcript as {@link HighlightCard}: the reader recognises
 * their own shelf by its covers, and a recommendation they can see is one they
 * can act on.
 */
export const BookCard = React.memo(function BookCard({ id, onNavigate }: BookCardProps) {
  const [mutedForeground] = useCSSVariable(['--color-muted-foreground']);
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

  // A book that is no longer in the library leaves no trace: better a missing
  // card than a card for something the reader cannot open.
  if (!data) return null;

  const progress =
    data.status === 'reading' && data.percentage != null
      ? `${Math.round(data.percentage * 100)}% read`
      : data.status === 'archived'
        ? 'Finished'
        : data.status === 'queued'
          ? 'In your queue'
          : null;

  return (
    /*
     * A solid card, one rung forward from the bubble it sits in.
     *
     * It used to draw no surface of its own and a gold rule down its edge,
     * inside an assistant bubble that is itself a gold tint with a gold rule:
     * two golds and no separation, so the card read as more bubble. The card
     * surface gives the cover and title their own ground, the hairline says
     * where it ends, and the gold stays with the bubble.
     */
    <Touchable
      className="my-1 flex-row items-center gap-3 border border-border bg-card px-3 py-2"
      onPress={() => onNavigate?.(id)}
      disabled={!onNavigate}
    >
      {data.coverUrl ? (
        // Cards ride the chat transcript's recycled list, so the decoded image
        // is pinned to this book id across cell reuse.
        <Image
          source={{ uri: data.coverUrl }}
          style={{ width: 40, height: 60 }}
          contentFit="cover"
          placeholder={{ blurhash: COVER_PLACEHOLDER_BLURHASH }}
          recyclingKey={id}
        />
      ) : (
        <View className="h-[60px] w-[40px] items-center justify-center bg-muted">
          <BookOpen size={18} color={asColor(mutedForeground)} />
        </View>
      )}

      <View className="flex-1 gap-[2px]">
        <ThemedText type="bodySm" numberOfLines={2}>
          {data.title}
        </ThemedText>
        <ThemedText type="labelSm" color={asColor(mutedForeground)} numberOfLines={1}>
          {data.author}
        </ThemedText>
        {progress && (
          // Ink rather than gold: the bubble already spends the gold, and a second
          // gold inside it competes with the answer for attention.
          <ThemedText type="labelSm" style={{ fontVariant: ['tabular-nums'] }}>
            {progress}
          </ThemedText>
        )}
      </View>
    </Touchable>
  );
});
