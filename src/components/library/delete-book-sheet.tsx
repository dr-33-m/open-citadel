import React from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { Touchable } from '@/components/ui/touchable';
import { ThemedText } from '@/components/themed-text';
import { useColors } from '@/hooks/use-colors';
import { spacing } from '@/constants/theme';
import type { books as booksTable } from '@/db/schema';

type Book = typeof booksTable.$inferSelect;

type DeleteBookSheetProps = {
  visible: boolean;
  book: Book | null;
  onClose: () => void;
  onConfirm: (bookId: string) => void;
};

export function DeleteBookSheet({
  visible,
  book,
  onClose,
  onConfirm,
}: DeleteBookSheetProps) {
  const colors = useColors();
  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, justifyContent: 'flex-end' },
        overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
        sheet: {
          backgroundColor: colors.surface.low,
          paddingHorizontal: spacing[6],
          paddingTop: spacing[4],
          paddingBottom: spacing[10],
          gap: spacing[5],
        },
        handle: {
          width: 40,
          height: 4,
          backgroundColor: colors.surface.highest,
          alignSelf: 'center',
          marginBottom: spacing[2],
        },
        deleteButton: {
          backgroundColor: '#e05252',
          paddingHorizontal: spacing[6],
          paddingVertical: spacing[4],
          alignItems: 'center',
          justifyContent: 'center',
        },
        cancel: {
          alignItems: 'center',
          paddingVertical: spacing[3],
        },
      }),
    [colors],
  );

  if (!book) return null;

  const handleConfirm = () => {
    onConfirm(book.id);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <Touchable style={styles.overlay} onPress={onClose} />

        <View style={styles.sheet}>
          <View style={styles.handle} />

          <ThemedText type="headlineSm">Delete Book</ThemedText>

          <ThemedText type="bodySm" color={colors.text.secondary}>
            Deleting{' '}
            <ThemedText type="bodySm" color={colors.text.primary}>
              {book.title}
            </ThemedText>
            {' '}will remove it from Open Citadel and delete it from your phone.
          </ThemedText>

          <Touchable style={styles.deleteButton} onPress={handleConfirm}>
            <ThemedText type="labelLg" color="#fff">
              DELETE
            </ThemedText>
          </Touchable>

          <Touchable onPress={onClose} style={styles.cancel}>
            <ThemedText type="labelSm" color={colors.text.secondary}>
              CANCEL
            </ThemedText>
          </Touchable>
        </View>
      </View>
    </Modal>
  );
}
