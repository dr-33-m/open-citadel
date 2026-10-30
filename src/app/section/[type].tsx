import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DrawerHeader } from '@/components/drawer-header';
import { IconButton } from '@/components/icon-button';
import { Plus, RefreshCw, Trash2 } from '@/components/icons';
import { Handover } from '@/components/navigation/handover';
import { CollectionGridSkeleton } from '@/components/skeletons/collection-grid-skeleton';
import { ThemedView } from '@/components/themed-view';
import { contentColumn } from '@/constants/theme';
import { BookGrid } from '@/features/library/components/book-grid';
import { BookQueueList } from '@/features/library/components/book-queue-list';
import { BookSheets } from '@/features/library/components/book-sheets';
import { CollectionList } from '@/features/library/components/collection-list';
import { NewCollectionPrompt } from '@/features/library/components/new-collection-prompt';
import { useBookSection } from '@/features/library/hooks/use-book-section';
import { useBookSheets } from '@/features/library/hooks/use-book-sheets';
import { useCollectionsSection } from '@/features/library/hooks/use-collections-section';
import { useNewCollection } from '@/features/library/hooks/use-new-collection';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { useSettledOnce } from '@/navigation/use-settled-once';

const COLUMNS = 2;

/** A books shelf's "View all", or every collection. */
export default function SectionScreen() {
  const { type } = useLocalSearchParams<{ type: string }>();
  return type === 'collections' ? <CollectionsSection /> : <BookSection type={type} />;
}

/** One shelf's books, searchable, with the shelf's own action in the header; the queue as rows in its own order. */
function BookSection({ type }: { type: string | undefined }) {
  const insets = useSafeAreaInsets();
  const tokens = useThemeTokens();
  // Heavy work (the grid, the sheets) waits for the drawer to land.
  // Content mounts when the slide has actually finished, and stays mounted.
  const landed = useSettledOnce();
  const section = useBookSection(type);
  const sheets = useBookSheets();
  const muted = tokens['--color-muted-foreground'];
  const rescanColor = section.rescan?.running ? tokens['--color-primary'] : muted;

  return (
    <ThemedView className="flex-1" style={{ paddingTop: insets.top }}>
      <DrawerHeader
        title={section.title}
        subtitle={section.subtitle}
        onClose={section.close}
        search={section.search}
        searchLabel="Search by title or author"
        canSearch={section.canSearch}
      >
        {section.rescan ? (
          <IconButton onPress={section.rescan.onPress} label="Rescan the library">
            {/* Gold only while it is actually running, which is a state and not decoration. */}
            <RefreshCw size={16} strokeWidth={2} color={rescanColor} />
          </IconButton>
        ) : null}
        {section.clearQueue ? (
          <IconButton onPress={section.clearQueue} label="Clear the queue">
            <Trash2 size={16} color={muted} strokeWidth={2} />
          </IconButton>
        ) : null}
      </DrawerHeader>
      {section.view === 'queue' ? (
        <BookQueueList
          queue={section.queue}
          ready={landed}
          emptyText={section.emptyText}
          bottomInset={insets.bottom}
          onOpen={section.openReader}
          onMenu={sheets.openMenu}
        />
      ) : (
        <BookGrid
          books={section.search.results}
          ready={landed}
          emptyText={section.emptyText}
          bottomInset={insets.bottom}
          onOpen={section.openReader}
          onMenu={sheets.openMenu}
        />
      )}
      {/* Sheets mount after the drawer has settled: four bottom sheets is more
          than the rise can absorb in its opening frames. */}
      {landed ? <BookSheets sheets={sheets} /> : null}
    </ThemedView>
  );
}

/** Every collection, searchable, and a new one from the header. */
function CollectionsSection() {
  const insets = useSafeAreaInsets();
  const tokens = useThemeTokens();
  // Content mounts when the slide has actually finished, and stays mounted.
  const landed = useSettledOnce();
  const section = useCollectionsSection();
  const newCollection = useNewCollection();
  const skeleton = (
    <View className="px-6" style={contentColumn}>
      <CollectionGridSkeleton columns={COLUMNS} />
    </View>
  );

  return (
    <ThemedView className="flex-1" style={{ paddingTop: insets.top }}>
      <DrawerHeader
        title="Collections"
        subtitle={section.subtitle}
        onClose={section.close}
        search={section.search}
        searchLabel="Search collections"
        canSearch={section.canSearch}
      >
        <IconButton onPress={newCollection.open} label="New collection">
          <Plus size={18} color={tokens['--color-foreground']} strokeWidth={2} />
        </IconButton>
      </DrawerHeader>
      <Handover ready={landed} skeleton={skeleton}>
        <CollectionList
          collections={section.results}
          columns={COLUMNS}
          emptyText={section.emptyText}
          bottomInset={insets.bottom}
          onOpen={section.openCollection}
        />
      </Handover>
      {landed ? <NewCollectionPrompt {...newCollection.prompt} /> : null}
    </ThemedView>
  );
}
