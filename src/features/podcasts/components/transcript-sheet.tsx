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
import { TranscriptTransport } from '@/features/podcasts/components/transcript-transport';
import type { TranscriptSheetState } from '@/features/podcasts/hooks/use-transcript-sheet';
import type { TranscriptLine } from '@/features/podcasts/utils/transcript-lines';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type TranscriptSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** "The Show · 1 hr 30 min". */
  line: string;
  /** Everything but the list's ref, which comes on its own so it goes straight to the list. */
  state: Omit<TranscriptSheetState, 'listRef'>;
  listRef: React.RefObject<FlashListRef<TranscriptLine> | null>;
};

const FILL = { flex: 1 } as const;
const keyOf = (line: TranscriptLine) => String(line.index);
/** Room under the last line, so it can still be brought up to where the spoken line sits. */
const LIST_END = { paddingBottom: 160 } as const;

/**
 * The transcript, read like lyrics: a line a sentence, each with its time, the
 * line being spoken marked in gold and held a third of the way down while the
 * rest step back. A tap on any line plays from there; search jumps between
 * matches. The header (title, line, search) is pinned above the list and
 * never scrolls; under it, while the episode plays, the scrubber and the
 * transport, so the sheet never has to be closed to pause. The list mounts
 * once the sheet has risen.
 */
export function TranscriptSheet({ visible, onClose, line, state, listRef }: TranscriptSheetProps) {
  const tokens = useThemeTokens();
  const gold = tokens['--color-primary'];
  const muted = tokens['--color-muted-foreground'];
  const { lit, match, dim, gutter, onRow, onLongPress, onHeading } = state;

  const renderItem = React.useCallback(
    ({ item }: { item: TranscriptLine }) => (
      <TranscriptRow
        line={item}
        lit={item.index === lit}
        dim={dim}
        match={item.index === match}
        gutter={gutter}
        gold={gold}
        muted={muted}
        onPress={onRow}
        onLongPress={onLongPress}
        onHeading={onHeading}
      />
    ),
    [dim, gold, gutter, lit, match, muted, onHeading, onLongPress, onRow],
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
      <View className="flex-1 overflow-hidden">
        <Sheet.Deferred skeleton={<TranscriptSkeleton />}>
          {state.loading ? (
            <TranscriptSkeleton />
          ) : (
            empty ?? (
              <PageFade edges="both" surface="popover">
                <Sheet.FlatList
                  ref={listRef}
                  style={FILL}
                  contentContainerStyle={LIST_END}
                  data={state.lines}
                  extraData={`${lit}:${match}:${dim}`}
                  keyExtractor={keyOf}
                  renderItem={renderItem}
                  keyboardShouldPersistTaps="handled"
                  onScrollBeginDrag={state.onDrag}
                  onLoad={state.onListLoad}
                  showsVerticalScrollIndicator={false}
                />
              </PageFade>
            )
          )}
        </Sheet.Deferred>
        {/* Over the list while it scrolls to the spoken line, so the rows it passes are never seen. */}
        {state.loading || state.placed ? null : (
          <View pointerEvents="none" className="absolute inset-0 bg-popover">
            <TranscriptSkeleton />
          </View>
        )}
        {state.showBackToNow ? (
          <View pointerEvents="box-none" className="absolute bottom-4 left-0 right-0 items-center">
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
      </View>
      {state.playing ? <TranscriptTransport /> : null}
    </Sheet>
  );
}
