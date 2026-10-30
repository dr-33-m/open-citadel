import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DrawerHeader } from '@/components/drawer-header';
import { IconButton } from '@/components/icon-button';
import { Plus, Trash2 } from '@/components/icons';
import { ThemedView } from '@/components/themed-view';
import { AddBooksSheet } from '@/features/library/components/add-books-sheet';
import { BookGrid } from '@/features/library/components/book-grid';
import { BookSheets } from '@/features/library/components/book-sheets';
import { useBookSheets } from '@/features/library/hooks/use-book-sheets';
import { useCollectionScreen } from '@/features/library/hooks/use-collection-screen';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { useSettledOnce } from '@/navigation/use-settled-once';

/** One collection: its books, and adding, removing and deleting. */
export default function CollectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const tokens = useThemeTokens();
  // The grid mounts when the slide has actually finished, and stays mounted.
  const landed = useSettledOnce();
  const screen = useCollectionScreen(id);
  // A collection manages its own membership, so its menu has no "Add to collection".
  const sheets = useBookSheets({ collections: false, onDeleted: screen.reload });

  return (
    <ThemedView className="flex-1" style={{ paddingTop: insets.top }}>
      <DrawerHeader
        title={screen.title}
        subtitle={screen.subtitle}
        onClose={screen.close}
        search={screen.search}
        searchLabel="Search by title or author"
        canSearch={screen.canSearch}
      >
        <IconButton onPress={screen.openAddBooks} label="Add books">
          <Plus size={18} color={tokens['--color-foreground']} strokeWidth={2} />
        </IconButton>
        <IconButton onPress={screen.deleteCollection} label="Delete collection">
          <Trash2 size={16} color={tokens['--color-muted-foreground']} strokeWidth={2} />
        </IconButton>
      </DrawerHeader>
      <BookGrid
        books={screen.search.results}
        ready={landed && screen.loaded}
        emptyText={screen.emptyText}
        bottomInset={insets.bottom}
        onOpen={screen.openReader}
        onMenu={sheets.openMenu}
      />
      {/* Sheets mount after the drawer has settled: several bottom sheets is
          more than the rise can absorb in its opening frames. */}
      {landed ? (
        <>
          <BookSheets sheets={sheets} />
          <AddBooksSheet {...screen.addBooks} />
        </>
      ) : null}
    </ThemedView>
  );
}
