import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Lock } from '@/components/icons';
import { ListEmpty } from '@/components/list-empty';
import { TransitionFlatList } from '@/components/navigation/transition-scroll';
import { PageFade } from '@/components/scroll-fades';
import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { contentColumn, layout } from '@/constants/theme';
import { MemoryPortrait } from '@/features/samwell-memory/components/memory-portrait';
import { MemorySection } from '@/features/samwell-memory/components/memory-section';
import type { MemoryNoteView, MemoryRow } from '@/features/samwell-memory/utils/memory-rows';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

const EMPTY_TEXT = 'Nothing yet. When you talk with Samwell in the cloud, what he wants to remember about you shows up here.';

const keyOf = (row: MemoryRow) => row.key;

type MemoryListProps = {
  rows: MemoryRow[];
  onOpenNote: (note: MemoryNoteView) => void;
  onOpenPortrait: () => void;
  onForgetAll: () => void;
};

/** His picture of them, then everything else he kept, a card for each kind. */
export function MemoryList({ rows, onOpenNote, onOpenPortrait, onForgetAll }: MemoryListProps) {
  const tokens = useThemeTokens();
  const insets = useSafeAreaInsets();
  const muted = tokens['--color-muted-foreground'];
  const contentStyle = React.useMemo(
    () => ({ paddingTop: layout.gutter, paddingBottom: layout.scrollBottom + insets.bottom }),
    [insets.bottom],
  );

  const renderItem = React.useCallback(
    ({ item }: { item: MemoryRow }) =>
      item.type === 'portrait' ? (
        <MemoryPortrait text={item.text} updated={item.updated} onOpen={onOpenPortrait} />
      ) : (
        <MemorySection title={item.title} notes={item.notes} onOpen={onOpenNote} />
      ),
    [onOpenNote, onOpenPortrait],
  );

  const header = (
    <View className="flex-row items-center gap-2 pb-6">
      <Lock size={14} color={muted} />
      <ThemedText type="bodySm" color={muted} className="flex-1">
        Kept on this phone. Sent only with your own messages.
      </ThemedText>
    </View>
  );
  const footer =
    rows.length > 0 ? (
      <Touchable onPress={onForgetAll} accessibilityRole="button" className="mt-10 items-center border border-border py-3">
        <ThemedText type="labelSm" color={muted}>
          FORGET EVERYTHING
        </ThemedText>
      </Touchable>
    ) : null;

  return (
    <PageFade>
      <TransitionFlatList
        data={rows}
        keyExtractor={keyOf}
        renderItem={renderItem}
        className="flex-1 px-6"
        style={contentColumn}
        contentContainerStyle={contentStyle}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        ListEmptyComponent={<ListEmpty text={EMPTY_TEXT} />}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={9}
      />
    </PageFade>
  );
}
