import { BookOpen, Lightbulb } from '@/components/icons';
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Touchable } from '@/components/ui/touchable';
import { eq } from 'drizzle-orm';

import { ThemedText } from '@/components/themed-text';
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
  // Literal colour for the lucide props and ThemedText's `color` prop.
  const [mutedForeground] = useCSSVariable(['--color-muted-foreground']);
  /*
   * Read during render, not in an effect.
   *
   * `.get()` on this driver is synchronous — the settings store calls it
   * without awaiting — so an effect bought nothing and cost a frame: the card
   * returned null on the first paint and its real height on the second, which
   * is a 0-to-100px layout jump landing in the middle of a streaming reply.
   * That is the blip. Reading here means the card's first paint is its only
   * paint.
   *
   * `useMemo` keyed on the row it is showing. A highlight does not change
   * under a chat bubble, and the list keys these by id, so a different id is a
   * different instance rather than a re-read.
   */
  const data = useMemo<CardData | null>(() => {
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

      if (!row) return null;
      return {
        text: row.text,
        bookTitle: row.bookTitle,
        bookId: row.bookId,
        locator: row.locator,
        color: row.color || null,
        tags: row.tags ? JSON.parse(row.tags) : [],
      };
    } else {
      const row = db
        .select()
        .from(thoughts)
        .where(eq(thoughts.id, id))
        .get();

      if (!row) return null;
      return {
        text: row.text,
        bookTitle: null,
        bookId: null,
        locator: null,
        color: row.color || null,
        tags: row.tags ? JSON.parse(row.tags) : [],
      };
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

  /*
   * The entry's own colour, when it has one, as a thin accent. That colour is
   * the reader's (it is how they told this highlight apart when they made it),
   * so it earns its place. An entry with no colour gets no accent rather than
   * the gold fallback it used to, which was a second gold inside a gold bubble.
   */
  const accent = data.color ? { borderLeftWidth: 2, borderLeftColor: data.color } : undefined;

  return (
    /*
     * A solid card on the translucent bubble, not a darker tint of it.
     *
     * `surface-tertiary` is a deep tan in light mode, and muted text on it fell
     * to roughly 2.6:1 inside a bubble that is already a gold tint. The card
     * surface puts the quote on the palette's own reading ground, where both
     * the quote and its muted source line hold their contrast in either mode.
     */
    <Touchable
      className="my-1 gap-1 border border-border bg-card px-3 py-2"
      style={accent}
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
