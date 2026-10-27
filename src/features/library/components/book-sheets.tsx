import React from 'react';

import { ListenSheets } from '@/features/audiobook/components/listen-sheets';
import { BookActionSheet } from '@/features/library/components/book-action-sheet';
import { CollectionPickerSheet } from '@/features/library/components/collection-picker-sheet';
import { DeleteBookSheet } from '@/features/library/components/delete-book-sheet';
import { EditTitleSheet } from '@/features/library/components/edit-title-sheet';
import type { BookSheetsState } from '@/features/library/hooks/use-book-sheets';

/** A book's menu and every sheet it leads to, from `useBookSheets`. */
export function BookSheets({ sheets }: { sheets: BookSheetsState }) {
  return (
    <>
      <BookActionSheet {...sheets.menu} />
      {sheets.picker ? <CollectionPickerSheet {...sheets.picker} /> : null}
      <DeleteBookSheet {...sheets.remove} />
      <EditTitleSheet {...sheets.rename} />
      <ListenSheets listen={sheets.listen} />
    </>
  );
}
