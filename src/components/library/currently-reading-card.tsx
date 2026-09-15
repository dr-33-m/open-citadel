import { Image } from 'expo-image';
import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Touchable } from '@/components/ui/touchable';
import { fontFamily, motion } from '@/constants/theme';
import type { books } from '@/db/schema';
import { useBooksStore } from '@/stores/books';

type Book = typeof books.$inferSelect;

type CurrentlyReadingCardProps = {
  book: Book;
  onPress?: () => void;
  onLongPress?: () => void;
};

/** ThemedText/lucide icons take a literal color, not a className — resolve
 * the semantic token once per render and fall back to `undefined` (which
 * lets `ThemedText` apply its own default) if it hasn't resolved yet. */
function asColor(value: string | number | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

const COVER_FILL = { width: '100%' as const, height: '100%' as const };

export function CurrentlyReadingCard({ book, onPress, onLongPress }: CurrentlyReadingCardProps) {
  const [ghostInk, mutedForeground, primary] = useCSSVariable([
    '--color-surface-tertiary',
    '--color-muted-foreground',
    '--color-primary',
  ]);
  /*
   * Read, not fetched, and not mirrored into local state.
   *
   * This was `useState` filled by a query on every focus, which is two copies
   * of one fact and a race between them: `closeBook` cannot await its write,
   * so the read that ran when the Library came back usually beat it and the
   * bar showed the previous visit's position. The store holds the one copy,
   * and the code that writes the row is what updates it.
   */
  const progress = useBooksStore((s) => s.progressByBook[book.id] ?? 0);

  return (
    <Touchable onPress={onPress} onLongPress={onLongPress}>
      <Card className="flex-row gap-5 p-5">
        <View className="aspect-[2/3] w-[90px] items-center justify-center overflow-hidden bg-muted">
          {book.coverUrl ? (
            <Image source={{ uri: book.coverUrl }} style={COVER_FILL} transition={motion.slow} />
          ) : (
            <>
              <ThemedText
                type="displayLg"
                color={asColor(ghostInk)}
                style={{ fontSize: 36, fontFamily: fontFamily.serif }}
              >
                {book.title.charAt(0).toUpperCase()}
              </ThemedText>
              <ThemedText
                type="labelSm"
                color={asColor(mutedForeground)}
                className="absolute bottom-2 px-2"
                style={{ textAlign: 'center', fontSize: 9 }}
                numberOfLines={2}
              >
                {book.title}
              </ThemedText>
            </>
          )}
        </View>

        <View className="flex-1 justify-center gap-2">
          {book.category && (
            <ThemedText type="labelSm" color={asColor(primary)}>
              {book.category}
            </ThemedText>
          )}
          <ThemedText type="headlineMd" numberOfLines={2}>{book.title}</ThemedText>
          <ThemedText type="bodySm" color={asColor(mutedForeground)}>
            {book.author}
          </ThemedText>

          <View className="mt-3 gap-2">
            <Progress value={progress} minValue={0} maxValue={1} size="sm" />
            {/* Below the bar, the same way the Compass insights card reads.
                `Progress` only draws its own labels above it, and above is
                where the title already is. */}
            <View className="flex-row items-center justify-between gap-3">
              <ThemedText type="labelSm" color={asColor(mutedForeground)}>
                PROGRESS
              </ThemedText>
              <ThemedText type="labelSm" color={asColor(primary)} style={{ fontVariant: ['tabular-nums'] }}>
                {Math.round(progress * 100)}%
              </ThemedText>
            </View>
          </View>
        </View>
      </Card>
    </Touchable>
  );
}
