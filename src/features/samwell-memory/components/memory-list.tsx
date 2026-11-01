import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionButton } from '@/components/action-button';
import { IconButton } from '@/components/icon-button';
import { Lock, Trash2 } from '@/components/icons';
import { ListEmpty } from '@/components/list-empty';
import { TransitionFlatList } from '@/components/navigation/transition-scroll';
import { PageFade } from '@/components/scroll-fades';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { contentColumn, layout } from '@/constants/theme';
import { MemoryNoteRow } from '@/features/samwell-memory/components/memory-note-row';
import type { MemoryRow } from '@/features/samwell-memory/utils/memory-rows';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

const EMPTY_TEXT = 'Nothing yet. After you talk with Samwell in the cloud, what he wants to remember shows up here.';

const keyOf = (row: MemoryRow) => row.key;

type MemoryListProps = {
  rows: MemoryRow[];
  subtitle: string;
  onForgetNote: (id: string) => void;
  onForgetProfile: () => void;
  onForgetAll: () => void;
};

/** Everything Samwell has kept, grouped, each piece with its own way to delete it. */
export function MemoryList({ rows, subtitle, onForgetNote, onForgetProfile, onForgetAll }: MemoryListProps) {
  const tokens = useThemeTokens();
  const insets = useSafeAreaInsets();
  const muted = tokens['--color-muted-foreground'];
  const contentStyle = React.useMemo(
    () => ({ paddingTop: layout.gutter, paddingBottom: layout.scrollBottom + insets.bottom }),
    [insets.bottom],
  );

  const renderItem = React.useCallback(
    ({ item }: { item: MemoryRow }) => {
      if (item.type === 'label') {
        return (
          <ThemedText type="labelSm" color={muted} className="pb-1 pt-8">
            {item.title}
          </ThemedText>
        );
      }
      if (item.type === 'profile') {
        return (
          <Card className="mt-2 flex-row items-start gap-3 p-4">
            <ThemedText type="bodyMd" className="flex-1">
              {item.text}
            </ThemedText>
            <IconButton onPress={onForgetProfile} label="Delete how he sees you">
              <Trash2 size={16} color={muted} strokeWidth={2} />
            </IconButton>
          </Card>
        );
      }
      return (
        <MemoryNoteRow id={item.id} text={item.text} createdAt={item.createdAt} closed={item.closed} onForget={onForgetNote} />
      );
    },
    [muted, onForgetNote, onForgetProfile],
  );

  const header = (
    <View className="gap-3">
      <ThemedText type="labelSm" color={muted}>
        {subtitle}
      </ThemedText>
      <View className="flex-row gap-3">
        <Lock size={16} color={muted} />
        <ThemedText type="bodySm" color={muted} className="flex-1">
          Kept on this phone. He only sends this with your own messages to the cloud.
        </ThemedText>
      </View>
    </View>
  );
  const footer =
    rows.length > 0 ? (
      <View className="items-start pt-8">
        <ActionButton icon={Trash2} label="DELETE EVERYTHING" tint={muted} onPress={onForgetAll} />
      </View>
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
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={9}
      />
    </PageFade>
  );
}
