import React from 'react';
import { View } from 'react-native';

import { TransitionFlatList } from '@/components/navigation/transition-scroll';
import { PageFade } from '@/components/scroll-fades';
import { ThemedText } from '@/components/themed-text';
import { contentColumn, spacing } from '@/constants/theme';
import { CollectionCell } from '@/features/library/components/collection-cell';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { CollectionWithCount } from '@/stores/collections';

type CollectionListProps = {
  collections: CollectionWithCount[];
  columns: number;
  emptyText: string;
  bottomInset: number;
  onOpen: (collectionId: string) => void;
};

// FlatList render budget, kept explicit rather than on RN's defaults: the
// first commit lands while the drawer is still rising, so it should paint
// only what is visible, and scroll batches stay small on low-end Android.
const RENDER_BUDGET = {
  initialNumToRender: 6,
  maxToRenderPerBatch: 6,
  windowSize: 9,
  updateCellsBatchingPeriod: 50,
};
const keyOf = (item: CollectionWithCount) => item.id;

/**
 * Every collection, a grid of cards. Virtualized (it used to map every
 * collection into a ScrollView and pay the whole mount up front), on the
 * transition-scroll list so the drawer's drag-to-close still works.
 */
export function CollectionList({ collections, columns, emptyText, bottomInset, onOpen }: CollectionListProps) {
  const tokens = useThemeTokens();
  const primary = tokens['--color-primary'];
  const contentStyle = React.useMemo(() => ({ paddingBottom: bottomInset + spacing[8] }), [bottomInset]);
  const renderItem = React.useCallback(
    ({ item }: { item: CollectionWithCount }) => (
      <CollectionCell id={item.id} name={item.name} count={item.count} primary={primary} onPress={onOpen} />
    ),
    [primary, onOpen],
  );
  const empty = (
    <View className="w-full items-center pt-16">
      <ThemedText type="bodySm" color={tokens['--color-muted-foreground']}>
        {emptyText}
      </ThemedText>
    </View>
  );

  return (
    <PageFade>
      <TransitionFlatList
        data={collections}
        keyExtractor={keyOf}
        renderItem={renderItem}
        numColumns={columns}
        className="flex-1"
        style={contentColumn}
        contentContainerClassName="px-6"
        contentContainerStyle={contentStyle}
        columnWrapperClassName="mb-4 gap-4"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={empty}
        {...RENDER_BUDGET}
      />
    </PageFade>
  );
}
