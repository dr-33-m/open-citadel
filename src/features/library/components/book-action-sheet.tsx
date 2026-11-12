import React from 'react';
import { View } from 'react-native';

import {
  BookOpen,
  CircleCheckBig,
  CircleMinus,
  CircleX,
  Clock,
  FolderPlus,
  Headphones,
  Lock,
  Pencil,
  RotateCcw,
  Star,
  StarOff,
  Trash2,
  type LucideIcon,
} from '@/components/icons';
import { MenuList } from '@/components/menu-list';
import { ThemedText } from '@/components/themed-text';
import { Sheet } from '@/components/ui/sheet';
import { bookMenu, type BookMenuAction } from '@/features/library/utils/book-menu';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { Book, BookStatus } from '@/stores/books';

const ICONS: Record<BookMenuAction, LucideIcon> = {
  open: BookOpen,
  listen: Headphones,
  'listen-locked': Lock,
  favorite: Star,
  unfavorite: StarOff,
  collection: FolderPlus,
  'stop-reading': CircleX,
  queue: Clock,
  dequeue: CircleMinus,
  finish: CircleCheckBig,
  unfinish: RotateCcw,
  rename: Pencil,
  delete: Trash2,
};

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
  /** Listening in a cloud voice, where the screen offers it: open, or behind a padlock that sells a plan. */
  listen?: 'open' | 'locked';
  onListen?: (bookId: string) => void;
};

/**
 * Everything that can be done to one book, from a long press on any shelf.
 * Which rows appear is `bookMenu`'s decision; every row closes the sheet.
 */
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
  listen,
  onListen,
}: BookActionSheetProps) {
  const tokens = useThemeTokens();

  // Deliberately NOT an early `return null`: that unmounts the sheet the
  // instant the parent clears the book, which is the same commit that closes
  // it, so the sheet vanishes with no exit animation at all. The shell holds
  // the last content through the close (see components/ui/sheet), so all this
  // has to do is render nothing once there is nothing to render.
  if (!book) return <Sheet visible={visible} onClose={onClose}>{null}</Sheet>;

  const rows = bookMenu(book, {
    collections: !!onAddToCollection,
    rename: !!onEditTitle,
    delete: !!onDelete,
    listen: onListen ? listen : null,
  });
  const handlers: Record<BookMenuAction, () => void> = {
    open: () => onOpen(book.id),
    listen: () => onListen?.(book.id),
    'listen-locked': () => onListen?.(book.id),
    favorite: () => onToggleFavorite(book.id),
    unfavorite: () => onToggleFavorite(book.id),
    collection: () => onAddToCollection?.(book.id),
    'stop-reading': () => onSetStatus(book.id, null),
    queue: () => onSetStatus(book.id, 'queued'),
    dequeue: () => onSetStatus(book.id, null),
    finish: () => onSetStatus(book.id, 'archived'),
    unfinish: () => onSetStatus(book.id, null),
    rename: () => onEditTitle?.(book.id),
    delete: () => onDelete?.(book.id),
  };
  const select = (action: BookMenuAction) => {
    handlers[action]();
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View className="gap-4">
        <ThemedText type="bodySm" color={tokens['--color-muted-foreground']} numberOfLines={1} className="px-4">
          {book.title}
        </ThemedText>
        <MenuList rows={rows} icons={ICONS} onSelect={select} />
      </View>
    </Sheet>
  );
}
