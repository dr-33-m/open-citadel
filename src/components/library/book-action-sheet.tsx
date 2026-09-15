import { BookOpen, CircleCheckBig, CircleMinus, CircleX, Clock, FolderPlus, Pencil, RotateCcw, Star, StarOff, Trash2 } from '@/components/icons';
import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Sheet } from '@/components/ui/sheet';
import { Item } from '@/components/ui/item';

import { ThemedText } from '@/components/themed-text';
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

/** ThemedText/lucide icons take a literal color, not a className. */
function asColor(value: string | number | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

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
  const [foreground, primary, mutedForeground, destructive] = useCSSVariable([
    '--color-foreground',
    '--color-primary',
    '--color-muted-foreground',
    '--color-destructive',
  ]);

  // Deliberately NOT an early `return null`: that unmounts the sheet the
  // instant the parent clears the book, which is the same commit that closes
  // it — so the sheet vanishes with no exit animation at all. The shell holds
  // the last content through the close (see components/ui/sheet), so all this
  // has to do is render nothing once there is nothing to render.
  if (!book) return <Sheet visible={visible} onClose={onClose}>{null}</Sheet>;

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
      {/* Menu density: the sheet shell hands over the whole gutter (see
          components/ui/sheet.tsx), so the rows own it — `Item`'s own `p-4`,
          which is `layout.gutterCompact` on both axes and a 52dp row. It is
          left to the variant rather than overridden per row because Uniwind
          resolves `p-*` over `px-*`/`py-*` whatever the class order, so the
          `p-0 px-4 py-3` these rows used to carry silently collapsed to no
          padding at all: a 20dp tap target, and icons flush against the
          sheet's edge. The hairlines between rows stay full-bleed, which is
          what makes a run of them read as a menu rather than a list. */}
      <View className="gap-4">
        <ThemedText
          type="bodySm"
          color={asColor(mutedForeground)}
          numberOfLines={1}
          className="px-4"
        >
          {book.title}
        </ThemedText>

        {/* Divider-menu list: Item rows with plain hairline Views between
            them (self-stretch — no percentage width to resolve, so the
            hairline is exactly as wide as the rows above and below it). */}
        <Item.Group>
          {/* Open */}
          <Item className="gap-4" onPress={handleOpen}>
            <Item.Media>
              <BookOpen size={20} color={asColor(foreground)} />
            </Item.Media>
            <Item.Content>
              <ThemedText type="bodyMd">
                Open
              </ThemedText>
            </Item.Content>
          </Item>

          <View className="h-px self-stretch bg-border" />

          {/* Favorite toggle */}
          <Item className="gap-4" onPress={handleToggleFavorite}>
            <Item.Media>
              {isFav ? (
                <StarOff size={20} color={asColor(foreground)} />
              ) : (
                <Star size={20} color={asColor(foreground)} />
              )}
            </Item.Media>
            <Item.Content>
              <ThemedText type="bodyMd">
                {isFav ? 'Remove from Favorites' : 'Add to Favorites'}
              </ThemedText>
            </Item.Content>
          </Item>

          {/* Add to Collection */}
          {onAddToCollection && (
            <>
              <View className="h-px self-stretch bg-border" />
              <Item
                className="gap-4"
                onPress={() => { onAddToCollection(book.id); onClose(); }}
              >
                <Item.Media>
                  <FolderPlus size={20} color={asColor(foreground)} />
                </Item.Media>
                <Item.Content>
                  <ThemedText type="bodyMd">
                    Add to Collection
                  </ThemedText>
                </Item.Content>
              </Item>
            </>
          )}

          {/* Remove from Currently Reading — only if currently reading */}
          {isReading && (
            <>
              <View className="h-px self-stretch bg-border" />
              <Item className="gap-4" onPress={handleRemoveFromCurrentlyReading}>
                <Item.Media>
                  <CircleX size={20} color={asColor(foreground)} />
                </Item.Media>
                <Item.Content>
                  <ThemedText type="bodyMd">
                    Remove from Currently Reading
                  </ThemedText>
                </Item.Content>
              </Item>
            </>
          )}

          {/* Add to Queue — only if not already queued or archived */}
          {!isQueued && !isArchived && (
            <>
              <View className="h-px self-stretch bg-border" />
              <Item className="gap-4" onPress={handleQueue}>
                <Item.Media>
                  <Clock size={20} color={asColor(foreground)} />
                </Item.Media>
                <Item.Content>
                  <ThemedText type="bodyMd">
                    Add to Queue
                  </ThemedText>
                </Item.Content>
              </Item>
            </>
          )}

          {/* Remove from Queue — only if currently queued */}
          {isQueued && (
            <>
              <View className="h-px self-stretch bg-border" />
              <Item className="gap-4" onPress={handleRemoveFromQueue}>
                <Item.Media>
                  <CircleMinus size={20} color={asColor(foreground)} />
                </Item.Media>
                <Item.Content>
                  <ThemedText type="bodyMd">
                    Remove from Queue
                  </ThemedText>
                </Item.Content>
              </Item>
            </>
          )}

          {/* Mark as Finished — only if not already archived */}
          {!isArchived && (
            <>
              <View className="h-px self-stretch bg-border" />
              <Item className="gap-4" onPress={handleFinish}>
                <Item.Media>
                  <CircleCheckBig size={20} color={asColor(primary)} />
                </Item.Media>
                <Item.Content>
                  <ThemedText type="bodyMd" color={asColor(primary)}>
                    Mark as Finished
                  </ThemedText>
                </Item.Content>
              </Item>
            </>
          )}

          {/* Mark as Unfinished — only if already archived */}
          {isArchived && (
            <>
              <View className="h-px self-stretch bg-border" />
              <Item className="gap-4" onPress={handleUnfinish}>
                <Item.Media>
                  <RotateCcw size={20} color={asColor(mutedForeground)} />
                </Item.Media>
                <Item.Content>
                  <ThemedText type="bodyMd" color={asColor(mutedForeground)}>
                    Mark as Unfinished
                  </ThemedText>
                </Item.Content>
              </Item>
            </>
          )}

          {/* Edit Title */}
          {onEditTitle && (
            <>
              <View className="h-px self-stretch bg-border" />
              <Item className="gap-4" onPress={handleEditTitle}>
                <Item.Media>
                  <Pencil size={20} color={asColor(foreground)} />
                </Item.Media>
                <Item.Content>
                  <ThemedText type="bodyMd">
                    Edit Title
                  </ThemedText>
                </Item.Content>
              </Item>
            </>
          )}

          {/* Delete */}
          {onDelete && (
            <>
              <View className="h-px self-stretch bg-border" />
              <Item className="gap-4" onPress={handleDelete}>
                <Item.Media>
                  <Trash2 size={20} color={asColor(destructive)} />
                </Item.Media>
                <Item.Content>
                  <ThemedText type="bodyMd" color={asColor(destructive)}>
                    Delete Book
                  </ThemedText>
                </Item.Content>
              </Item>
            </>
          )}
        </Item.Group>
      </View>
    </Sheet>
  );
}
