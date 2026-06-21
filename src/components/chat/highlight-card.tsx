import { BookOpen, Lightbulb } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { eq } from 'drizzle-orm';

import { ThemedText } from '@/components/themed-text';
import { spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import { db } from '@/db/client';
import { books, highlights, thoughts } from '@/db/schema';

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
  color: string;
  tags: string[];
}

export const HighlightCard = React.memo(function HighlightCard({
  id,
  type,
  onNavigate,
  onNavigateToTimeline,
}: HighlightCardProps) {
  const colors = useColors();
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
          color: row.color || '#f2ca50',
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
          color: row.color || '#f2ca50',
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
    <Pressable
      style={[
        styles.card,
        {
          backgroundColor: colors.surface.highest,
          borderLeftColor: data.color,
        },
      ]}
      onPress={handlePress}
      disabled={!canPress}
    >
      <ThemedText
        type="bodySm"
        color={colors.text.primary}
        numberOfLines={3}
        style={styles.quoteText}
      >
        {data.text}
      </ThemedText>

      <View style={styles.sourceRow}>
        {type === 'highlight' && data.bookTitle ? (
          <>
            <BookOpen size={12} color={colors.text.secondary} />
            <ThemedText
              type="labelSm"
              color={colors.text.secondary}
              numberOfLines={1}
              style={styles.sourceLabel}
            >
              {data.bookTitle}
            </ThemedText>
          </>
        ) : type === 'thought' ? (
          <>
            <Lightbulb size={12} color={colors.text.secondary} />
            <ThemedText type="labelSm" color={colors.text.secondary}>
              Thought
            </ThemedText>
          </>
        ) : null}
      </View>

      {data.tags.length > 0 && (
        <View style={styles.tagsRow}>
          {data.tags.slice(0, 3).map((tag) => (
            <View
              key={tag}
              style={[styles.tagPill, { backgroundColor: colors.surface.mid }]}
            >
              <ThemedText type="labelSm" color={colors.text.secondary}>
                {tag}
              </ThemedText>
            </View>
          ))}
        </View>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    borderLeftWidth: 3,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    marginVertical: spacing[1],
    gap: spacing[1],
  },
  quoteText: {
    fontStyle: 'italic',
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  sourceLabel: {
    flex: 1,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[1],
  },
  tagPill: {
    paddingHorizontal: spacing[2],
    paddingVertical: 1,
  },
});
