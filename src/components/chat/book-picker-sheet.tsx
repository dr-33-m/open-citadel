import { BottomSheetFlatList, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { Image } from 'expo-image';
import { ChevronRight, Search } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
} from 'react-native';

import { Sheet } from '@/components/ui/sheet';
import { Touchable } from '@/components/ui/touchable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { fontFamily, motion, spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import { useAllBooks, useBooksStore } from '@/stores/books';

/**
 * Row geometry. A picker is a scanning task, so every row is the same height
 * and the cover is small: titles here run from three words to a full
 * subtitle-laden Victorian mouthful, and letting them set the row height turns
 * the list into a ragged wall you can't skim. The title gets two lines and
 * then truncates — enough to tell two books apart, never enough to dominate.
 */
const COVER_WIDTH = 40;
const COVER_HEIGHT = 56;

interface BookPickerSheetProps {
  visible: boolean;
  onSelect(bookId: string, bookTitle: string): void;
  onSkip?(): void;
  onClose(): void;
}

export function BookPickerSheet({ visible, onSelect, onSkip, onClose }: BookPickerSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const allBooks = useAllBooks();
  const loadBooks = useBooksStore((s) => s.loadBooks);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (visible) loadBooks();
  }, [visible]);

  const filtered = query.trim()
    ? allBooks.filter(
        (b) =>
          b.title.toLowerCase().includes(query.toLowerCase()) ||
          b.author.toLowerCase().includes(query.toLowerCase()),
      )
    : allBooks;

  const styles = StyleSheet.create({
    sheet: {
      flex: 1,
      backgroundColor: colors.surface.low,
      paddingBottom: insets.bottom + spacing[4],
      paddingTop: spacing[2],
    },
    list: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing[4],
      paddingBottom: spacing[3],
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing[2],
      marginHorizontal: spacing[4],
      marginBottom: spacing[3],
      backgroundColor: colors.surface.mid,
      paddingHorizontal: spacing[3],
    },
    // The field owns the vertical padding, not the row: that keeps the whole
    // height tappable to focus, rather than only the glyph-free strip.
    searchInput: {
      flex: 1,
      paddingVertical: spacing[2],
      color: colors.text.primary,
      fontFamily: 'Manrope_400Regular',
      fontSize: 14,
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing[3],
      paddingHorizontal: spacing[4],
      paddingVertical: spacing[3],
      borderBottomWidth: 1,
      borderBottomColor: colors.outline.variant,
    },
    cover: {
      width: COVER_WIDTH,
      height: COVER_HEIGHT,
      backgroundColor: colors.surface.mid,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    coverImage: { width: COVER_WIDTH, height: COVER_HEIGHT },
    // Stands in for a missing cover so the text column still starts at the
    // same x on every row — a ragged left edge is what makes a list feel
    // unbalanced, more than any font size does.
    coverInitial: {
      fontFamily: fontFamily.serif,
      fontSize: 18,
    },
    itemText: {
      flex: 1,
      gap: 2,
    },
    itemTitle: { fontSize: 15, lineHeight: 20 },
    itemAuthor: { fontSize: 12, lineHeight: 16 },
    noResult: {
      padding: spacing[4],
      alignItems: 'center',
    },
    skipBtn: {
      margin: spacing[4],
      paddingVertical: spacing[3],
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.outline.variant,
    },
  });

  return (
    <Sheet visible={visible} onClose={onClose} fixedHeightRatio={0.7} scrollable>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <ThemedText type="headlineSm">Pick a book</ThemedText>
          <Touchable onPress={onClose}>
            <ThemedText type="labelMd" color={colors.text.secondary}>
              CANCEL
            </ThemedText>
          </Touchable>
        </View>

        <View style={styles.searchRow}>
          <Search size={16} color={colors.text.secondary} />
          <BottomSheetTextInput
            style={styles.searchInput}
            placeholder="Search books…"
            placeholderTextColor={colors.text.secondary}
            value={query}
            onChangeText={setQuery}
          />
        </View>

        {filtered.length === 0 ? (
          <View style={[styles.noResult, styles.list]}>
            <ThemedText type="bodySm" color={colors.text.secondary}>
              No books found
            </ThemedText>
          </View>
        ) : (
          <BottomSheetFlatList
            style={styles.list}
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Touchable style={styles.item} onPress={() => onSelect(item.id, item.title)}>
                <View style={styles.cover}>
                  {item.coverUrl ? (
                    <Image
                      source={{ uri: item.coverUrl }}
                      style={styles.coverImage}
                      transition={motion.slow}
                    />
                  ) : (
                    <ThemedText color={colors.surface.highest} style={styles.coverInitial}>
                      {item.title.charAt(0).toUpperCase()}
                    </ThemedText>
                  )}
                </View>
                <View style={styles.itemText}>
                  <ThemedText type="bodyMd" numberOfLines={2} style={styles.itemTitle}>
                    {item.title}
                  </ThemedText>
                  <ThemedText
                    type="bodySm"
                    color={colors.text.secondary}
                    numberOfLines={1}
                    style={styles.itemAuthor}
                  >
                    {item.author}
                  </ThemedText>
                </View>
                <ChevronRight size={16} color={colors.text.secondary} />
              </Touchable>
            )}
          />
        )}

        {onSkip && (
          <Touchable style={styles.skipBtn} onPress={onSkip}>
            <ThemedText type="labelMd" color={colors.text.secondary}>
              START WITHOUT A BOOK
            </ThemedText>
          </Touchable>
        )}
      </View>
    </Sheet>
  );
}
