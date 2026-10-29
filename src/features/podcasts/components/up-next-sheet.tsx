import React from 'react';
import { View } from 'react-native';

import { DragList } from '@/components/drag-list';
import { X } from '@/components/icons';
import { PageFade } from '@/components/scroll-fades';
import { ThemedText } from '@/components/themed-text';
import { Sheet } from '@/components/ui/sheet';
import { Touchable } from '@/components/ui/touchable';
import { PodcastArtwork } from '@/features/podcasts/components/podcast-artwork';
import { playLabel } from '@/features/podcasts/utils/format';
import { useDragOrder, type DragMove } from '@/hooks/use-drag-order';
import { episodeArtwork } from '@/services/podcasts/download-paths';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { EpisodeItem } from '@/services/podcasts/records';

type UpNextSheetProps = {
  visible: boolean;
  episodes: EpisodeItem[];
  onClose: () => void;
  onPlay: (episodeId: string) => void;
  /** Moves an episode to a new place in Up Next. */
  onMove: (episodeId: string, toIndex: number) => void;
  onRemove: (episodeId: string) => void;
  onClear: () => void;
};

const keyExtractor = (item: EpisodeItem) => item.id;
const LIST_STYLE = { paddingBottom: 16 };

/**
 * What plays after this, in order. Pressing an episode plays it now; its grip
 * drags it to a new place, and its ✕ takes it out.
 *
 * The sheet drags by its grabber only. Its content drag is an ancestor of the
 * rows' and would take every vertical drag inside it, the grip's included, so
 * it is given up: the list scrolls, the grip carries, the grabber moves the
 * sheet.
 */
export function UpNextSheet({ visible, episodes, onClose, onPlay, onMove, onRemove, onClear }: UpNextSheetProps) {
  const tokens = useThemeTokens();
  const muted = tokens['--color-muted-foreground'];
  const save = React.useCallback(({ id, to }: DragMove) => onMove(id, to), [onMove]);
  const queue = useDragOrder(episodes, keyExtractor, save);

  const renderItem = React.useCallback(
    ({ item }: { item: EpisodeItem }) => (
      <View className="flex-row items-center gap-3 py-2.5 pl-4 pr-2">
        <Touchable className="flex-1 flex-row items-center gap-3" onPress={() => onPlay(item.id)} accessibilityRole="button" accessibilityLabel={`Play ${item.title}`}>
          <PodcastArtwork uri={episodeArtwork(item)} size={48} recyclingKey={item.id} placeholderColor={tokens['--color-surface-tertiary']} />
          <View className="flex-1 gap-0.5">
            <ThemedText type="bodySm" numberOfLines={2}>
              {item.title}
            </ThemedText>
            <ThemedText type="labelSm" color={muted} numberOfLines={1}>
              {`${item.showTitle} · ${playLabel(item)}`}
            </ThemedText>
          </View>
        </Touchable>
        <Touchable className="h-10 w-10 items-center justify-center" hitSlop={4} onPress={() => onRemove(item.id)} accessibilityRole="button" accessibilityLabel="Remove from Up Next">
          <X size={18} color={muted} />
        </Touchable>
      </View>
    ),
    [muted, onPlay, onRemove, tokens],
  );

  return (
    <Sheet visible={visible} onClose={onClose} scrollable contentPanning={false} snapRatios={[0.6, 0.92]}>
      <View className="flex-row items-baseline gap-3 px-4 pb-3">
        <ThemedText type="headlineSm" className="flex-1">
          Up Next
        </ThemedText>
        {episodes.length > 0 ? (
          <Touchable onPress={onClear} haptic="warn" accessibilityRole="button" accessibilityLabel="Clear Up Next">
            <ThemedText type="labelSm" color={tokens['--color-primary']}>
              CLEAR
            </ThemedText>
          </Touchable>
        ) : null}
      </View>
      {episodes.length === 0 ? (
        <ThemedText type="bodySm" color={muted} className="px-4 pb-8">
          {'Nothing is queued. Choose “Play next” or “Add to Up Next” on any episode.'}
        </ThemedText>
      ) : (
        <PageFade edges="both" surface="popover">
          <DragList
            data={queue.items}
            onReorder={queue.onReorder}
            dragEnabled
            host="sheet"
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            contentContainerStyle={LIST_STYLE}
          />
        </PageFade>
      )}
    </Sheet>
  );
}
