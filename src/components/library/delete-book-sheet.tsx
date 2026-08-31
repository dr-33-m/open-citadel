import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Sheet } from '@/components/ui/sheet';
import { Touchable } from '@/components/ui/touchable';
import { ThemedText } from '@/components/themed-text';
import type { books as booksTable } from '@/db/schema';

type Book = typeof booksTable.$inferSelect;

type DeleteBookSheetProps = {
  visible: boolean;
  book: Book | null;
  onClose: () => void;
  onConfirm: (bookId: string) => void;
};

/** ThemedText takes a literal color, not a className. */
function asColor(value: string | number | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function DeleteBookSheet({
  visible,
  book,
  onClose,
  onConfirm,
}: DeleteBookSheetProps) {
  const [mutedForeground, destructiveForeground] = useCSSVariable([
    '--color-muted-foreground',
    '--color-destructive-foreground',
  ]);

  // Not an early `return null` — see the note in book-action-sheet: the
  // parent clears the book in the same commit that closes the sheet, and
  // unmounting here takes the exit animation with it.
  if (!book) return <Sheet visible={visible} onClose={onClose}>{null}</Sheet>;

  const handleConfirm = () => {
    onConfirm(book.id);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View className="gap-6 px-6">
        <ThemedText type="headlineSm">Delete Book</ThemedText>

        <ThemedText type="bodySm" color={asColor(mutedForeground)}>
          Deleting{' '}
          <ThemedText type="bodySm">
            {book.title}
          </ThemedText>
          {' '}will remove it from Open Citadel and delete it from your phone.
        </ThemedText>

        <View className="gap-3">
          <Touchable className="items-center justify-center bg-destructive px-6 py-4" onPress={handleConfirm}>
            <ThemedText type="labelLg" color={asColor(destructiveForeground)}>
              DELETE
            </ThemedText>
          </Touchable>

          <Touchable onPress={onClose} className="items-center py-3">
            <ThemedText type="labelSm" color={asColor(mutedForeground)}>
              CANCEL
            </ThemedText>
          </Touchable>
        </View>
      </View>
    </Sheet>
  );
}
