import type { FlashListRef, ListRenderItem } from '@shopify/flash-list';
import React from 'react';
import { View } from 'react-native';

import { AudioLines } from '@/components/icons';
import { PageFade } from '@/components/scroll-fades';
import { ThemedText } from '@/components/themed-text';
import { Sheet } from '@/components/ui/sheet';
import { Touchable } from '@/components/ui/touchable';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

export type FollowAlongList<T> = {
  data: readonly T[];
  renderItem: ListRenderItem<T>;
  keyExtractor: (item: T) => string;
  /** Anything a row draws from outside its item, so the list redraws when it changes. */
  extraData: unknown;
  /** Changes when the list starts again somewhere else (`useFollowAlong`'s epoch). */
  listKey: string;
  onDrag: () => void;
  onListLoad: () => void;
  onStartReached: () => void;
};

type FollowAlongSheetProps<T> = {
  visible: boolean;
  onClose: () => void;
  /** Pinned above the list, never scrolled: the title, its line, a search. */
  header: React.ReactNode;
  /** The list's own shape, while the sheet rises and while what it holds is read. */
  skeleton: React.ReactNode;
  loading: boolean;
  /** Said in place of the list when there is nothing to follow. */
  empty?: React.ReactNode;
  list: FollowAlongList<T>;
  listRef: React.RefObject<FlashListRef<T> | null>;
  showBackToNow: boolean;
  onBackToNow: () => void;
  /** Pinned under the list: the scrubber and the transport, so following never means closing the sheet to pause. */
  footer?: React.ReactNode;
};

const FILL = { flex: 1 } as const;
/** Room under the last row, so it can still be brought up to where the spoken row sits. */
const LIST_END = { paddingBottom: 160 } as const;

/**
 * Following what is being spoken, read like lyrics: an episode's transcript
 * or a book's text. The row being spoken is held a third of the way down
 * while the rest step back (`useFollowAlong`); a drag lets the reader read
 * on their own, and BACK TO NOW brings the voice back into view. The header
 * is pinned above the list and never scrolls, the sheet has a fixed height
 * so the list gets the drag, and the list mounts once the sheet has risen.
 *
 * One sheet for both: each kind brings only its header and its rows.
 */
export function FollowAlongSheet<T>({
  visible,
  onClose,
  header,
  skeleton,
  loading,
  empty = null,
  list,
  listRef,
  showBackToNow,
  onBackToNow,
  footer,
}: FollowAlongSheetProps<T>) {
  const gold = useThemeTokens()['--color-primary'];

  return (
    <Sheet visible={visible} onClose={onClose} fixedHeightRatio={0.9} scrollable>
      <View className="gap-3 px-6 pb-3">{header}</View>
      <View className="flex-1 overflow-hidden">
        <Sheet.Deferred skeleton={skeleton}>
          {loading ? (
            skeleton
          ) : (
            empty ?? (
              <PageFade edges="both" surface="popover">
                <Sheet.FlatList
                  key={list.listKey}
                  ref={listRef}
                  style={FILL}
                  contentContainerStyle={LIST_END}
                  data={list.data}
                  extraData={list.extraData}
                  keyExtractor={list.keyExtractor}
                  renderItem={list.renderItem}
                  keyboardShouldPersistTaps="handled"
                  onScrollBeginDrag={list.onDrag}
                  onLoad={list.onListLoad}
                  onStartReached={list.onStartReached}
                  showsVerticalScrollIndicator={false}
                />
              </PageFade>
            )
          )}
        </Sheet.Deferred>
        {showBackToNow ? (
          <View pointerEvents="box-none" className="absolute bottom-4 left-0 right-0 items-center">
            <Touchable
              className="min-h-10 flex-row items-center gap-2 border border-border bg-card px-4 shadow-sm"
              onPress={onBackToNow}
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
      {footer}
    </Sheet>
  );
}

/** The line under a follow-along sheet's title: muted, one line. */
export function FollowAlongTitle({ title, line, action }: { title: string; line: string; action?: React.ReactNode }) {
  const muted = useThemeTokens()['--color-muted-foreground'];
  return (
    <View className="flex-row items-start gap-3">
      <View className="flex-1 gap-1">
        <ThemedText type="headlineSm" numberOfLines={1}>
          {title}
        </ThemedText>
        <ThemedText type="bodySm" color={muted} numberOfLines={1}>
          {line}
        </ThemedText>
      </View>
      {action}
    </View>
  );
}
