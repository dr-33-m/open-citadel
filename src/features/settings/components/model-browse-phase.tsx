import React from 'react';
import { View } from 'react-native';

import { ChevronRight } from '@/components/icons';
import { PageFade } from '@/components/scroll-fades';
import { ModelListSkeleton } from '@/components/skeletons/model-list-skeleton';
import { ThemedText } from '@/components/themed-text';
import { Item } from '@/components/ui/item';
import { SearchBar } from '@/components/ui/search-bar';
import { Sheet } from '@/components/ui/sheet';
import { Touchable } from '@/components/ui/touchable';
import { CatalogueNotice } from '@/features/settings/components/catalogue-notice';
import { ModelPickerHeader } from '@/features/settings/components/model-picker-header';
import type { useModelSheet } from '@/features/settings/hooks/use-model-sheet';
import type { HFRepo } from '@/services/huggingface';
import { formatCount } from '@/utils/format';

type SheetState = ReturnType<typeof useModelSheet>;

const FILL = { flex: 1 } as const;

function RowSeparator() {
  return <Item.Separator />;
}

/** One catalogue brain. Memoized, so filtering skips the rows that did not change. */
const BrainRow = React.memo(function BrainRow({
  repo,
  mutedForeground,
  onOpen,
}: {
  repo: HFRepo;
  mutedForeground?: string;
  onOpen: (repoId: string) => void;
}) {
  return (
    <Item className="px-6 py-3" onPress={() => onOpen(repo.id)}>
      <Item.Content>
        <Item.Title numberOfLines={1}>{repo.name}</Item.Title>
        <Item.Description numberOfLines={1}>{formatCount(repo.downloads)} downloads</Item.Description>
      </Item.Content>
      <Item.Actions>
        <ChevronRight size={16} color={mutedForeground} />
      </Item.Actions>
    </Item>
  );
});

/**
 * The catalogue of brains this phone can run.
 *
 * The filter field sits above the list, not inside it. As the list's header it
 * was rebuilt with every render of the list, which is what made typing into it
 * unreliable. Here it is the same uncontrolled `SearchBar` the book picker
 * uses: the text lives in the native buffer, `onChangeText` mirrors it out,
 * and `fieldEpoch` remounts it empty when browsing starts over.
 */
export function ModelBrowsePhase({
  sheet,
  mutedForeground,
  primary,
}: {
  sheet: SheetState;
  mutedForeground?: string;
  primary?: string;
}) {
  const { results, loadingCatalogue, catalogueError, query, openRepo } = sheet;
  const trimmed = query.trim();

  const renderItem = React.useCallback(
    ({ item }: { item: HFRepo }) => (
      <BrainRow repo={item} mutedForeground={mutedForeground} onOpen={openRepo} />
    ),
    [mutedForeground, openRepo],
  );

  let body: React.ReactNode;
  if (results.length > 0) {
    body = (
      <PageFade edges="both" surface="popover">
        <Sheet.FlatList
          style={FILL}
          data={results}
          keyExtractor={(item: HFRepo) => item.id}
          ItemSeparatorComponent={RowSeparator}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        />
      </PageFade>
    );
  } else if (loadingCatalogue) {
    body = <ModelListSkeleton />;
  } else if (catalogueError) {
    body = (
      <View className="gap-3 px-6 py-4">
        <ThemedText type="bodySm" color={mutedForeground}>
          {catalogueError}
        </ThemedText>
        <Touchable className="self-start bg-muted px-3 py-2" onPress={sheet.retryCatalogue}>
          <ThemedText type="labelSm" color={primary}>
            TRY AGAIN
          </ThemedText>
        </Touchable>
      </View>
    );
  } else {
    body = (
      <View className="px-6 py-4">
        <ThemedText type="bodySm" color={mutedForeground}>
          {trimmed ? `No brains match "${trimmed}".` : 'No brains available right now.'}
        </ThemedText>
      </View>
    );
  }

  return (
    <>
      {/* No way back drawn: this is its own sheet over the list, and a drag
          down returns to it. */}
      <ModelPickerHeader title="Find Brains" primary={primary} />
      <View className="mx-6 mb-3">
        <CatalogueNotice />
      </View>
      <View className="mx-6 mb-3">
        <SearchBar
          key={sheet.fieldEpoch}
          variant="filled"
          placeholder="Filter brains…"
          onChangeText={sheet.setQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <Sheet.Deferred skeleton={<ModelListSkeleton />}>{body}</Sheet.Deferred>
    </>
  );
}
