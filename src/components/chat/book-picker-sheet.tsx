import { BottomSheetFlatList, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
} from 'react-native';

import { Sheet } from '@/components/ui/sheet';
import { Touchable } from '@/components/ui/touchable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import { useAllBooks, useBooksStore } from '@/stores/books';

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
    searchInput: {
      marginHorizontal: spacing[4],
      marginBottom: spacing[3],
      backgroundColor: colors.surface.mid,
      paddingHorizontal: spacing[3],
      paddingVertical: spacing[2],
      color: colors.text.primary,
      fontFamily: 'Manrope_400Regular',
      fontSize: 14,
    },
    item: {
      paddingHorizontal: spacing[4],
      paddingVertical: spacing[3],
      borderBottomWidth: 1,
      borderBottomColor: colors.outline.variant,
    },
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

        <BottomSheetTextInput
          style={styles.searchInput}
          placeholder="Search…"
          placeholderTextColor={colors.text.secondary}
          value={query}
          onChangeText={setQuery}
        />

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
                <ThemedText type="bodyMd">{item.title}</ThemedText>
                <ThemedText type="bodySm" color={colors.text.secondary}>
                  {item.author}
                </ThemedText>
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
