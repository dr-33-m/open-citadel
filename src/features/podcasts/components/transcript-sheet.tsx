import type { FlashListRef } from '@shopify/flash-list';
import React from 'react';
import { View } from 'react-native';

import { AudioLines, BookOpen } from '@/components/icons';
import { PageFade } from '@/components/scroll-fades';
import { ThemedText } from '@/components/themed-text';
import { Sheet } from '@/components/ui/sheet';
import { Touchable } from '@/components/ui/touchable';
import { TranscriptRow } from '@/features/podcasts/components/transcript-row';
import { TranscriptSearch } from '@/features/podcasts/components/transcript-search';
import { TranscriptSkeleton } from '@/features/podcasts/components/transcript-skeleton';
import type { TranscriptSheetState } from '@/features/podcasts/hooks/use-transcript-sheet';
import type { TranscriptRow as Row } from '@/features/podcasts/utils/transcript-rows';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type TranscriptSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** "The Show · 1 hr 30 min". */
  line: string;
  /** Everything but the list's ref, which comes on its own so it goes straight to the list. */
  state: Omit<TranscriptSheetState, 'listRef'>;
  listRef: React.RefObject<FlashListRef<Row> | null>;
};

const FILL = { flex: 1 } as const;
const keyOf = (row: Row) => String(row.index);

/**
 * The transcript, over the player, following the audio: the line being
 * spoken is lit gold and kept in view, a tap on any line plays from there,
 * and search jumps between matches. The header (title, line, search) is
 * pinned above the list and never scrolls; the list mounts once the sheet
 * has risen.
 */
export function TranscriptSheet({ visible, onClose, line, state, listRef }: TranscriptSheetProps) {
  const tokens = useThemeTokens();
  const gold = tokens['--color-primary'];
  const muted = tokens['--color-muted-foreground'];
  const { lit, match, onRow, onLongPress, onSpeaker } = state;

  const renderItem = React.useCallback(
    ({ item }: { item: Row }) => (
      <TranscriptRow
        row={item}
        lit={item.index === lit}
        match={item.index === match}
        gold={gold}
        muted={muted}
        onPress={onRow}
        onLongPress={onLongPress}
        onSpeaker={onSpeaker}
      />
    ),
    [gold, lit, match, muted, onLongPress, onRow, onSpeaker],
  );

  const empty = state.empty ? (
    <ThemedText type="bodySm" color={muted} className="px-6 pt-4">
      There is no transcript for this episode yet.
    </ThemedText>
  ) : null;

  return (
    <Sheet visible={visible} onClose={onClose} fixedHeightRatio={0.9} scrollable>
      <View className="gap-3 px-6 pb-3">
        <View className="flex-row items-start gap-3">
          <View className="flex-1 gap-1">
            <ThemedText type="headlineSm">Transcript</ThemedText>
            <ThemedText type="bodySm" color={muted} numberOfLines={1}>
              {line}
            </ThemedText>
          </View>
          <Touchable onPress={() => void state.readInReader()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Read in the reader">
            <BookOpen size={20} color={gold} />
          </Touchable>
        </View>
        <TranscriptSearch {...state.search} />
      </View>
      <Sheet.Deferred skeleton={<TranscriptSkeleton />}>
        {state.loading ? (
          <TranscriptSkeleton />
        ) : (
          empty ?? (
            <PageFade edges="both" surface="popover">
              <Sheet.FlatList
                ref={listRef}
                style={FILL}
                data={state.rows}
                extraData={`${lit}:${match}`}
                keyExtractor={keyOf}
                renderItem={renderItem}
                keyboardShouldPersistTaps="handled"
                onScrollBeginDrag={state.onDrag}
              />
            </PageFade>
          )
        )}
      </Sheet.Deferred>
      {state.showBackToNow ? (
        <View pointerEvents="box-none" className="absolute bottom-6 left-0 right-0 items-center">
          <Touchable
            className="min-h-10 flex-row items-center gap-2 border border-border bg-card px-4 shadow-sm"
            onPress={state.onBackToNow}
            haptic="select"
            accessibilityRole="button"
            accessibilityLabel="Back to now"
          >
            <AudioLines size={14} color={gold} />
            <ThemedText type="labelSm">BACK TO NOW</ThemedText>
          </Touchable>
        </View>
      ) : null}
    </Sheet>
  );
}
