import { Image } from 'expo-image';
import { eq } from 'drizzle-orm';
import { BookOpen } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { elevation } from '@/constants/theme';
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
  const [primary, mutedForeground] = useCSSVariable(['--color-primary', '--color-muted-foreground']);
  const [data, setData] = React.useState<CardData | null>(null);

  React.useEffect(() => {
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

    setData(row ?? null);
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
    <Touchable
      className="my-1 flex-row items-center gap-3 border-l-[3px] border-l-primary px-3 py-2"
      style={elevation.soft}
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
          <ThemedText type="labelSm" color={asColor(primary)} style={{ fontVariant: ['tabular-nums'] }}>
            {progress}
          </ThemedText>
        )}
      </View>
    </Touchable>
  );
});
