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
import { MemoryEvent } from '@/features/samwell-memory/components/memory-event';
import type { MemoryNoteView, MemoryRow } from '@/features/samwell-memory/utils/memory-rows';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

/** Where the biography lives and the one use it is put to: nothing about collecting what is said. */
const PRIVACY_NOTE = 'Kept on this phone. Samwell Cloud uses it only to answer you, and keeps none of it.';
const EMPTY_TEXT = 'Nothing yet. When you talk with Samwell in the cloud, what he wants to remember about you shows up here.';

const keyOf = (row: MemoryRow) => row.key;

type MemoryListProps = {
  rows: MemoryRow[];
  onOpenNote: (note: MemoryNoteView) => void;
  onOpenPortrait: () => void;
  onForgetAll: () => void;
};

/** His picture of them, then everything else he kept, as one timeline. */
export function MemoryList({ rows, onOpenNote, onOpenPortrait, onForgetAll }: MemoryListProps) {
  const tokens = useThemeTokens();
  const insets = useSafeAreaInsets();
  const muted = tokens['--color-muted-foreground'];
  const contentStyle = React.useMemo(
    () => ({ paddingTop: layout.gutter, paddingBottom: layout.scrollBottom + insets.bottom }),
    [insets.bottom],
  );

  const renderItem = React.useCallback(
    ({ item }: { item: MemoryRow }) => {
      if (item.type === 'portrait') {
        return <MemoryPortrait text={item.text} updated={item.updated} onOpen={onOpenPortrait} />;
      }
      if (item.type === 'heading') {
        return (
          <ThemedText type="labelSm" color={muted} className="pb-4 pt-10">
            {item.title}
          </ThemedText>
        );
      }
      const { type: _type, key: _key, ...event } = item;
      return <MemoryEvent {...event} onOpen={onOpenNote} />;
    },
    [muted, onOpenNote, onOpenPortrait],
  );

  // Where it is kept and what it is used for, at the foot, under the one
  // thing to do with it: shown before there is anything in it too.
  const footer = (
    <View className="mt-10 gap-4">
      {rows.length > 0 ? (
        <Touchable onPress={onForgetAll} accessibilityRole="button" className="items-center border border-border py-3">
          <ThemedText type="labelSm" color={muted}>
            FORGET EVERYTHING
          </ThemedText>
        </Touchable>
      ) : null}
      <View className="flex-row items-center justify-center gap-2">
        <Lock size={14} color={muted} />
        <ThemedText type="bodySm" color={muted} className="shrink text-center">
          {PRIVACY_NOTE}
        </ThemedText>
      </View>
    </View>
  );

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
        ListFooterComponent={footer}
        ListEmptyComponent={<ListEmpty text={EMPTY_TEXT} />}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={9}
      />
    </PageFade>
  );
}
