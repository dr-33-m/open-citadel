import React from 'react';
import { View } from 'react-native';

import { ChevronDown, ChevronUp, X } from '@/components/icons';
import { PageFade } from '@/components/scroll-fades';
import { ThemedText } from '@/components/themed-text';
import { Sheet } from '@/components/ui/sheet';
import { Touchable } from '@/components/ui/touchable';
import { PodcastArtwork } from '@/features/podcasts/components/podcast-artwork';
import { playLabel } from '@/features/podcasts/utils/format';
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

/**
 * What plays after this, in order. Pressing an episode plays it now; the
 * marks on its row move it up or down one place, or take it out. One place at
 * a time rather than a drag: a drag inside a sheet that is itself dragged
 * fights the sheet, and two presses reach any order a queue this short needs.
 */
export function UpNextSheet({ visible, episodes, onClose, onPlay, onMove, onRemove, onClear }: UpNextSheetProps) {
  const tokens = useThemeTokens();
  const muted = tokens['--color-muted-foreground'];
  const last = episodes.length - 1;

  const renderItem = React.useCallback(
    ({ item, index }: { item: EpisodeItem; index: number }) => (
      <View className="flex-row items-center gap-3 px-4 py-2.5">
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
        <Touchable
          className="h-10 w-9 items-center justify-center"
          disabled={index === 0}
          onPress={() => onMove(item.id, index - 1)}
          haptic="select"
          accessibilityRole="button"
          accessibilityLabel="Move up"
        >
          <ChevronUp size={18} color={index === 0 ? tokens['--color-surface-tertiary'] : muted} />
        </Touchable>
        <Touchable
          className="h-10 w-9 items-center justify-center"
          disabled={index === last}
          onPress={() => onMove(item.id, index + 1)}
          haptic="select"
          accessibilityRole="button"
          accessibilityLabel="Move down"
        >
          <ChevronDown size={18} color={index === last ? tokens['--color-surface-tertiary'] : muted} />
        </Touchable>
        <Touchable className="h-10 w-10 items-center justify-center" hitSlop={4} onPress={() => onRemove(item.id)} accessibilityRole="button" accessibilityLabel="Remove from Up Next">
          <X size={18} color={muted} />
        </Touchable>
      </View>
    ),
    [last, muted, onMove, onPlay, onRemove, tokens],
  );

  return (
    <Sheet visible={visible} onClose={onClose} scrollable snapRatios={[0.6, 0.92]}>
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
          {'Nothing is queued. Choose \u201cPlay next\u201d or \u201cAdd to Up Next\u201d on any episode.'}
        </ThemedText>
      ) : (
        <PageFade edges="both" surface="popover">
          <Sheet.FlatList data={episodes} keyExtractor={keyExtractor} renderItem={renderItem} />
        </PageFade>
      )}
    </Sheet>
  );
}
