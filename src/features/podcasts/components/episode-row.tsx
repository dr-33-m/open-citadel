import React from 'react';
import { View } from 'react-native';

import { Ellipsis } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { DownloadButton } from '@/features/podcasts/components/download-button';
import { PlayChip } from '@/features/podcasts/components/play-chip';
import { PodcastArtwork } from '@/features/podcasts/components/podcast-artwork';
import { episodeMeta, listenedFraction } from '@/features/podcasts/utils/format';
import { episodeArtwork } from '@/services/podcasts/download-paths';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { EpisodeItem } from '@/services/podcasts/records';

const ART = 56;

type EpisodeRowProps = {
  episode: EpisodeItem;
  /** Lists across shows draw each episode's artwork and show; a show's own page does not. */
  withShow?: boolean;
  onPress: (episodeId: string) => void;
  onMenu: (episode: EpisodeItem) => void;
  onPlay: (episodeId: string) => void;
  onDownload: (episodeId: string) => void;
  onRemoveDownload: (episodeId: string) => void;
};

/**
 * An episode in a list: when it came out and how long it is, its title in the
 * library's serif, the first lines of its notes, and the three things done to
 * it most — play, download, and the menu with everything else.
 *
 * A played episode dims to the secondary ink rather than disappearing, so
 * the list still reads as the show's whole run.
 *
 * Every branch sets its value explicitly, because FlashList recycles rows: a
 * row that omitted something would show the previous episode's.
 */
function EpisodeRowBase({ episode, withShow = false, onPress, onMenu, onPlay, onDownload, onRemoveDownload }: EpisodeRowProps) {
  const tokens = useThemeTokens();
  const muted = tokens['--color-muted-foreground'];
  const played = episode.playState === 'played';
  const fraction = listenedFraction(episode);
  const started = fraction > 0 && !played;

  return (
    <Touchable onPress={() => onPress(episode.id)} onLongPress={() => onMenu(episode)}>
      <View className="gap-3 px-6 py-5">
        <View className="flex-row gap-3">
          {withShow ? (
            <PodcastArtwork
              uri={episodeArtwork(episode)}
              size={ART}
              recyclingKey={episode.id}
              placeholderColor={tokens['--color-surface-tertiary']}
            />
          ) : null}
          <View className="flex-1 gap-1">
            <View className="flex-row items-center gap-2">
              {episode.playState === 'new' ? <View className="h-2 w-2 bg-primary" accessibilityLabel="New" /> : null}
              <ThemedText type="labelSm" color={muted} numberOfLines={1} className="flex-1">
                {withShow ? `${episode.showTitle} · ${episodeMeta(episode)}` : episodeMeta(episode)}
              </ThemedText>
            </View>
            <ThemedText type="headlineSm" numberOfLines={2} color={played ? muted : undefined}>
              {episode.title}
            </ThemedText>
          </View>
        </View>
        {episode.summary ? (
          <ThemedText type="bodySm" color={muted} numberOfLines={2}>
            {episode.summary}
          </ThemedText>
        ) : null}
        <View className="flex-row items-center gap-3">
          <PlayChip episode={episode} onPress={onPlay} />
          {started ? (
            <View className="h-[3px] w-12 bg-muted">
              <View className="h-full bg-primary" style={{ width: `${fraction * 100}%` }} />
            </View>
          ) : null}
          <View className="flex-1" />
          <DownloadButton episode={episode} onDownload={onDownload} onRemove={onRemoveDownload} />
          <Touchable
            className="h-10 w-10 items-center justify-center"
            hitSlop={4}
            onPress={() => onMenu(episode)}
            accessibilityRole="button"
            accessibilityLabel="More"
          >
            <Ellipsis size={20} color={muted} />
          </Touchable>
        </View>
      </View>
    </Touchable>
  );
}

export const EpisodeRow = React.memo(EpisodeRowBase);
