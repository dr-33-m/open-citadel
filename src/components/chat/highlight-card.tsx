import { BookOpen, Lightbulb } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Touchable } from '@/components/ui/touchable';
import { eq } from 'drizzle-orm';

import { ThemedText } from '@/components/themed-text';
import { elevation } from '@/constants/theme';
import { db } from '@/db/client';
import { books, highlights, thoughts } from '@/db/schema';
import { asColor } from '@/utils/colors';

interface HighlightCardProps {
  id: string;
  type: 'highlight' | 'thought';
  onNavigate?: (bookId: string, locator: string) => void;
  onNavigateToTimeline?: () => void;
}

interface CardData {
  text: string;
  bookTitle: string | null;
  bookId: string | null;
  locator: string | null;
  color: string | null;
  tags: string[];
}

export const HighlightCard = React.memo(function HighlightCard({
  id,
  type,
  onNavigate,
  onNavigateToTimeline,
}: HighlightCardProps) {
  // Literal colours for the lucide props, ThemedText's `color` prop, and the
  // entry colour fallback in the left border.
  const [primary, mutedForeground] = useCSSVariable(['--color-primary', '--color-muted-foreground']);
  const [data, setData] = useState<CardData | null>(null);

  useEffect(() => {
    if (type === 'highlight') {
      const row = db
        .select({
          text: highlights.text,
          locator: highlights.locator,
          color: highlights.color,
          tags: highlights.tags,
          bookId: highlights.bookId,
          bookTitle: books.title,
        })
        .from(highlights)
        .innerJoin(books, eq(highlights.bookId, books.id))
        .where(eq(highlights.id, id))
        .get();

      if (row) {
        setData({
          text: row.text,
          bookTitle: row.bookTitle,
          bookId: row.bookId,
          locator: row.locator,
          color: row.color || null,
          tags: row.tags ? JSON.parse(row.tags) : [],
        });
      }
    } else {
      const row = db
        .select()
        .from(thoughts)
        .where(eq(thoughts.id, id))
        .get();

      if (row) {
        setData({
          text: row.text,
          bookTitle: null,
          bookId: null,
          locator: null,
          color: row.color || null,
          tags: row.tags ? JSON.parse(row.tags) : [],
        });
      }
    }
  }, [id, type]);

  if (!data) return null;

  const handlePress = () => {
    if (type === 'highlight' && data.bookId && data.locator && onNavigate) {
      onNavigate(data.bookId, data.locator);
    } else if (type === 'thought' && onNavigateToTimeline) {
      onNavigateToTimeline();
    }
  };

  const canPress =
    (type === 'highlight' && data.bookId && data.locator && onNavigate) ||
    (type === 'thought' && onNavigateToTimeline);

  return (
    <Touchable
      className="my-1 gap-1 border-l-[3px] bg-surface-tertiary px-3 py-2"
      style={[elevation.soft, { borderLeftColor: data.color ?? asColor(primary) }]}
      onPress={handlePress}
      disabled={!canPress}
    >
      <ThemedText type="bodySm" italic numberOfLines={3}>
        {data.text}
      </ThemedText>

      <View className="flex-row items-center gap-1">
        {type === 'highlight' && data.bookTitle ? (
          <>
            <BookOpen size={12} color={asColor(mutedForeground)} />
            <ThemedText
              type="labelSm"
              color={asColor(mutedForeground)}
              numberOfLines={1}
              className="flex-1"
            >
              {data.bookTitle}
            </ThemedText>
          </>
        ) : type === 'thought' ? (
          <>
            <Lightbulb size={12} color={asColor(mutedForeground)} />
            <ThemedText type="labelSm" color={asColor(mutedForeground)}>
              Thought
            </ThemedText>
          </>
        ) : null}
      </View>

      {data.tags.length > 0 && (
        <View className="flex-row flex-wrap gap-1">
          {data.tags.slice(0, 3).map((tag) => (
            <View key={tag} className="bg-muted px-2 py-[1px]">
              <ThemedText type="labelSm" color={asColor(mutedForeground)}>
                {tag}
              </ThemedText>
            </View>
          ))}
        </View>
      )}
    </Touchable>
  );
});
