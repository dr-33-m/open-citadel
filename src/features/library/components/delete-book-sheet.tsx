import React from 'react';

import { ConfirmRemoveSheet, type RemovalCopy } from '@/components/confirm-remove-sheet';
import type { Book } from '@/stores/books';

type DeleteBookSheetProps = {
  visible: boolean;
  book: Book | null;
  onClose: () => void;
  onConfirm: (bookId: string) => void;
};

/** Asking before a book is deleted from the phone. */
export function DeleteBookSheet({ visible, book, onClose, onConfirm }: DeleteBookSheetProps) {
  const copy: RemovalCopy | null = book
    ? {
        title: 'Delete Book',
        lead: 'Deleting',
        subject: book.title,
        rest: 'will remove it from Open Citadel and delete it from your phone.',
        confirmLabel: 'DELETE',
      }
    : null;
  const confirm = React.useCallback(() => {
    if (book) onConfirm(book.id);
  }, [book, onConfirm]);
  return <ConfirmRemoveSheet visible={visible} copy={copy} onClose={onClose} onConfirm={confirm} />;
}
