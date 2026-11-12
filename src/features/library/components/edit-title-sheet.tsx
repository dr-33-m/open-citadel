import React from 'react';

import { EditTextSheet } from '@/components/edit-text-sheet';
import { TitleText } from '@/lib/text-fields';
import type { Book } from '@/stores/books';

type EditTitleSheetProps = {
  visible: boolean;
  book: Book | null;
  onClose: () => void;
  onSave: (bookId: string, title: string) => void;
};

/** Renaming a book: the shared text sheet, on its title. */
export function EditTitleSheet({ visible, book, onClose, onSave }: EditTitleSheetProps) {
  const save = React.useCallback((title: string) => {
    if (book) onSave(book.id, title);
  }, [book, onSave]);

  return (
    <EditTextSheet
      visible={visible}
      editKey={book?.id ?? null}
      heading="Edit Title"
      placeholder="Book title…"
      initialText={book?.title ?? ''}
      schema={TitleText}
      onClose={onClose}
      onSave={save}
    />
  );
}
