import { BookOpen, CheckCircle, Clock, MinusCircle, Star, StarOff } from 'lucide-react-native';
import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { colors, spacing } from '@/constants/theme';
import type { BookStatus } from '@/stores/books';
import type { books as booksTable } from '@/db/schema';

type Book = typeof booksTable.$inferSelect;

type BookActionSheetProps = {
  visible: boolean;
  book: Book | null;
  onClose: () => void;
  onOpen: (bookId: string) => void;
  onToggleFavorite: (bookId: string) => void;
  onSetStatus: (bookId: string, status: BookStatus | null) => void;
};

export function BookActionSheet({
  visible,
  book,
  onClose,
  onOpen,
  onToggleFavorite,
  onSetStatus,
}: BookActionSheetProps) {
  if (!book) return null;

  const isArchived = book.status === 'archived';
  const isQueued = book.status === 'queued';
  const isFav = book.isFavorite === 1;

  const handleOpen = () => {
    onOpen(book.id);
    onClose();
  };

  const handleToggleFavorite = () => {
    onToggleFavorite(book.id);
    onClose();
  };

  const handleQueue = () => {
    onSetStatus(book.id, 'queued');
    onClose();
  };

  const handleRemoveFromQueue = () => {
    onSetStatus(book.id, null);
    onClose();
  };

  const handleFinish = () => {
    onSetStatus(book.id, 'archived');
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
        <Pressable style={styles.overlay} onPress={onClose} />

        <View style={styles.sheet}>
          <View style={styles.handle} />

          <ThemedText
            type="bodySm"
            color={colors.text.secondary}
            numberOfLines={1}
            style={styles.bookTitle}
          >
            {book.title}
          </ThemedText>

          {/* Open */}
          <Pressable style={styles.row} onPress={handleOpen}>
            <BookOpen size={20} color={colors.text.primary} />
            <ThemedText type="bodyMd" color={colors.text.primary}>
              Open
            </ThemedText>
          </Pressable>

          <View style={styles.separator} />

          {/* Favorite toggle */}
          <Pressable style={styles.row} onPress={handleToggleFavorite}>
            {isFav ? (
              <StarOff size={20} color={colors.text.primary} />
            ) : (
              <Star size={20} color={colors.text.primary} />
            )}
            <ThemedText type="bodyMd" color={colors.text.primary}>
              {isFav ? 'Remove from Favorites' : 'Add to Favorites'}
            </ThemedText>
          </Pressable>

          {/* Add to Queue — only if not already queued or archived */}
          {!isQueued && !isArchived && (
            <>
              <View style={styles.separator} />
              <Pressable style={styles.row} onPress={handleQueue}>
                <Clock size={20} color={colors.text.primary} />
                <ThemedText type="bodyMd" color={colors.text.primary}>
                  Add to Queue
                </ThemedText>
              </Pressable>
            </>
          )}

          {/* Remove from Queue — only if currently queued */}
          {isQueued && (
            <>
              <View style={styles.separator} />
              <Pressable style={styles.row} onPress={handleRemoveFromQueue}>
                <MinusCircle size={20} color={colors.text.primary} />
                <ThemedText type="bodyMd" color={colors.text.primary}>
                  Remove from Queue
                </ThemedText>
              </Pressable>
            </>
          )}

          {/* Mark as Finished — only if not already archived */}
          {!isArchived && (
            <>
              <View style={styles.separator} />
              <Pressable style={styles.row} onPress={handleFinish}>
                <CheckCircle size={20} color={colors.primary.default} />
                <ThemedText type="bodyMd" color={colors.primary.default}>
                  Mark as Finished
                </ThemedText>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: colors.surface.low,
    paddingHorizontal: spacing[6],
    paddingTop: spacing[4],
    paddingBottom: spacing[10],
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: colors.surface.highest,
    alignSelf: 'center',
    marginBottom: spacing[4],
  },
  bookTitle: {
    marginBottom: spacing[2],
  },
  separator: {
    height: 1,
    backgroundColor: colors.surface.highest,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    paddingVertical: spacing[4],
  },
});
