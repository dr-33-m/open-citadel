import { BookOpen, CheckCircle, Clock, FolderPlus, MinusCircle, Pencil, RotateCcw, Star, StarOff, Trash2, XCircle } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Sheet } from '@/components/ui/sheet';
import { Touchable } from '@/components/ui/touchable';

import { ThemedText } from '@/components/themed-text';
import { useColors } from '@/hooks/use-colors';
import { spacing } from '@/constants/theme';
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
  onAddToCollection?: (bookId: string) => void;
  onDelete?: (bookId: string) => void;
  onEditTitle?: (bookId: string) => void;
};

export function BookActionSheet({
  visible,
  book,
  onClose,
  onOpen,
  onToggleFavorite,
  onSetStatus,
  onAddToCollection,
  onDelete,
  onEditTitle,
}: BookActionSheetProps) {
  const colors = useColors();
  const styles = React.useMemo(() => StyleSheet.create({
    sheet: {
      backgroundColor: colors.surface.low,
      paddingHorizontal: spacing[6],
      paddingTop: spacing[4],
      paddingBottom: spacing[10],
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
  }), [colors]);

  if (!book) return null;

  const isArchived = book.status === 'archived';
  const isQueued = book.status === 'queued';
  const isReading = book.status === 'reading';
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

  const handleUnfinish = () => {
    onSetStatus(book.id, null);
    onClose();
  };

  const handleRemoveFromCurrentlyReading = () => {
    onSetStatus(book.id, null);
    onClose();
  };

  const handleEditTitle = () => {
    onEditTitle?.(book.id);
    onClose();
  };

  const handleDelete = () => {
    onDelete?.(book.id);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.sheet}>
        <ThemedText
          type="bodySm"
          color={colors.text.secondary}
          numberOfLines={1}
          style={styles.bookTitle}
        >
          {book.title}
        </ThemedText>

        {/* Open */}
        <Touchable style={styles.row} onPress={handleOpen}>
          <BookOpen size={20} color={colors.text.primary} />
          <ThemedText type="bodyMd" color={colors.text.primary}>
            Open
          </ThemedText>
        </Touchable>

        <View style={styles.separator} />

        {/* Favorite toggle */}
        <Touchable style={styles.row} onPress={handleToggleFavorite}>
          {isFav ? (
            <StarOff size={20} color={colors.text.primary} />
          ) : (
            <Star size={20} color={colors.text.primary} />
          )}
          <ThemedText type="bodyMd" color={colors.text.primary}>
            {isFav ? 'Remove from Favorites' : 'Add to Favorites'}
          </ThemedText>
        </Touchable>

        {/* Add to Collection */}
        {onAddToCollection && (
          <>
            <View style={styles.separator} />
            <Touchable style={styles.row} onPress={() => { onAddToCollection(book.id); onClose(); }}>
              <FolderPlus size={20} color={colors.text.primary} />
              <ThemedText type="bodyMd" color={colors.text.primary}>
                Add to Collection
              </ThemedText>
            </Touchable>
          </>
        )}

        {/* Remove from Currently Reading — only if currently reading */}
        {isReading && (
          <>
            <View style={styles.separator} />
            <Touchable style={styles.row} onPress={handleRemoveFromCurrentlyReading}>
              <XCircle size={20} color={colors.text.primary} />
              <ThemedText type="bodyMd" color={colors.text.primary}>
                Remove from Currently Reading
              </ThemedText>
            </Touchable>
          </>
        )}

        {/* Add to Queue — only if not already queued or archived */}
        {!isQueued && !isArchived && (
          <>
            <View style={styles.separator} />
            <Touchable style={styles.row} onPress={handleQueue}>
              <Clock size={20} color={colors.text.primary} />
              <ThemedText type="bodyMd" color={colors.text.primary}>
                Add to Queue
              </ThemedText>
            </Touchable>
          </>
        )}

        {/* Remove from Queue — only if currently queued */}
        {isQueued && (
          <>
            <View style={styles.separator} />
            <Touchable style={styles.row} onPress={handleRemoveFromQueue}>
              <MinusCircle size={20} color={colors.text.primary} />
              <ThemedText type="bodyMd" color={colors.text.primary}>
                Remove from Queue
              </ThemedText>
            </Touchable>
          </>
        )}

        {/* Mark as Finished — only if not already archived */}
        {!isArchived && (
          <>
            <View style={styles.separator} />
            <Touchable style={styles.row} onPress={handleFinish}>
              <CheckCircle size={20} color={colors.primary.default} />
              <ThemedText type="bodyMd" color={colors.primary.default}>
                Mark as Finished
              </ThemedText>
            </Touchable>
          </>
        )}

        {/* Mark as Unfinished — only if already archived */}
        {isArchived && (
          <>
            <View style={styles.separator} />
            <Touchable style={styles.row} onPress={handleUnfinish}>
              <RotateCcw size={20} color={colors.text.secondary} />
              <ThemedText type="bodyMd" color={colors.text.secondary}>
                Mark as Unfinished
              </ThemedText>
            </Touchable>
          </>
        )}

        {/* Edit Title */}
        {onEditTitle && (
          <>
            <View style={styles.separator} />
            <Touchable style={styles.row} onPress={handleEditTitle}>
              <Pencil size={20} color={colors.text.primary} />
              <ThemedText type="bodyMd" color={colors.text.primary}>
                Edit Title
              </ThemedText>
            </Touchable>
          </>
        )}

        {/* Delete */}
        {onDelete && (
          <>
            <View style={styles.separator} />
            <Touchable style={styles.row} onPress={handleDelete}>
              <Trash2 size={20} color="#e05252" />
              <ThemedText type="bodyMd" color="#e05252">
                Delete Book
              </ThemedText>
            </Touchable>
          </>
        )}
      </View>
    </Sheet>
  );
}
