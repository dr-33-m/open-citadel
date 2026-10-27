import type { FlashListRef } from '@shopify/flash-list';
import React from 'react';

import { ScrollText } from '@/components/icons';
import { FollowAlongSheet, FollowAlongTitle } from '@/components/follow-along/follow-along-sheet';
import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { TranscriptRow, type TranscriptRowColors } from '@/features/podcasts/components/transcript-row';
import { TranscriptSearch } from '@/features/podcasts/components/transcript-search';
import { TranscriptSkeleton } from '@/features/podcasts/components/transcript-skeleton';
import { FollowAlongTransport } from '@/features/podcasts/components/follow-along-transport';
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

const keyOf = (line: TranscriptLine) => String(line.index);

/**
 * The transcript, in the follow-along sheet (`FollowAlongSheet`): a line a
 * sentence, each with its time, the line being spoken marked in gold. A tap
 * on any line plays from there; search jumps between matches. The header
 * (title, line, search) is pinned above the list; under it, while the
 * episode plays, the scrubber and the transport.
 */
export function TranscriptSheet({ visible, onClose, line, state, listRef }: TranscriptSheetProps) {
  const tokens = useThemeTokens();
  const gold = tokens['--color-primary'];
  const muted = tokens['--color-muted-foreground'];
  const ink = tokens['--color-foreground'];
  const band = tokens['--color-muted'];
  const colors = React.useMemo<TranscriptRowColors>(() => ({ ink, gold, muted, band }), [band, gold, ink, muted]);
  const { lit, match, marked, dim, gutter, onRow, onLongPress, onHeading } = state;

  const renderItem = React.useCallback(
    ({ item }: { item: TranscriptLine }) => (
      <TranscriptRow
        line={item}
        lit={item.index === lit}
        dim={dim}
        match={item.index === match}
        mark={marked.get(item.index)?.color}
        gutter={gutter}
        colors={colors}
        onPress={onRow}
        onLongPress={onLongPress}
        onHeading={onHeading}
      />
    ),
    [colors, dim, gutter, lit, marked, match, onHeading, onLongPress, onRow],
  );

  // Anything a row draws from outside its line, so the list redraws when it changes.
  const extra = React.useMemo(() => ({ lit, match, dim, marked }), [dim, lit, marked, match]);

  const empty = state.empty ? (
    <ThemedText type="bodySm" color={muted} className="px-6 pt-4">
      There is no transcript for this episode yet.
    </ThemedText>
  ) : null;
  const readAction = (
    <Touchable onPress={() => void state.readInReader()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Read in the reader">
      <ScrollText size={20} color={gold} />
    </Touchable>
  );

  return (
    <FollowAlongSheet
      visible={visible}
      onClose={onClose}
      header={
        <>
          <FollowAlongTitle title="Transcript" line={line} action={readAction} />
          <TranscriptSearch {...state.search} />
        </>
      }
      skeleton={<TranscriptSkeleton />}
      loading={state.loading}
      empty={empty}
      list={{
        data: state.lines,
        renderItem,
        keyExtractor: keyOf,
        extraData: extra,
        listKey: state.listKey,
        onDrag: state.onDrag,
        onListLoad: state.onListLoad,
        onStartReached: state.onStartReached,
      }}
      listRef={listRef}
      showBackToNow={state.showBackToNow}
      onBackToNow={state.onBackToNow}
      footer={state.playing ? <FollowAlongTransport /> : null}
    />
  );
}
