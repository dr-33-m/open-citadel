import React from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { TileBadge, type TileBadgeIcon } from '@/components/tile-badge';
import { Touchable } from '@/components/ui/touchable';
import { PlayChip } from '@/features/podcasts/components/play-chip';
import { PodcastArtwork } from '@/features/podcasts/components/podcast-artwork';
import { listenedFraction } from '@/features/podcasts/utils/format';
import { episodeArtwork } from '@/services/podcasts/download-paths';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { EpisodeItem } from '@/services/podcasts/records';

/** `p-4` on the panel, both sides. The same panel a book tile sits on. */
const TILE_PADDING = 16;

type EpisodeTileProps = {
  episode: EpisodeItem;
  width: number;
  onPress: (episodeId: string) => void;
  onLongPress: (episode: EpisodeItem) => void;
  onPlay: (episodeId: string) => void;
  /** A mark over the artwork's corner, for a shelf that flags its episodes (Favorites). */
  badgeIcon?: TileBadgeIcon;
};

/**
 * One episode on a shelf.
 *
 * The book tile's panel, so a shelf of episodes and a shelf of books are the
 * same kind of object on the same ground. The artwork fills the panel's width
 * (it is square, where a book cover is tall, so there is no ground to leave
 * around it), with how far in the listener is drawn as a gold line under it.
 */
function EpisodeTileBase({ episode, width, onPress, onLongPress, onPlay, badgeIcon }: EpisodeTileProps) {
  const tokens = useThemeTokens();
  const art = width - TILE_PADDING * 2;
  const fraction = listenedFraction(episode);
  const started = fraction > 0 && episode.playState !== 'played';

  return (
    <Touchable style={{ width }} onPress={() => onPress(episode.id)} onLongPress={() => onLongPress(episode)}>
      <View className="gap-3 bg-tile p-4">
        <View className="shadow-sm">
          <PodcastArtwork
            uri={episodeArtwork(episode)}
            size={art}
            recyclingKey={episode.id}
            placeholderColor={tokens['--color-surface-tertiary']}
          />
          {started ? (
            <View className="absolute bottom-0 left-0 right-0 h-[3px] bg-inset">
              <View className="h-full bg-primary" style={{ width: `${fraction * 100}%` }} />
            </View>
          ) : null}
          {badgeIcon ? <TileBadge icon={badgeIcon} color={tokens['--color-primary']} /> : null}
        </View>
        <View className="gap-1">
          <ThemedText type="labelSm" color={tokens['--color-muted-foreground']} numberOfLines={1}>
            {episode.showTitle}
          </ThemedText>
          <ThemedText type="headlineSm" numberOfLines={2} style={{ minHeight: 48 }}>
            {episode.title}
          </ThemedText>
        </View>
        <PlayChip episode={episode} onPress={onPlay} />
      </View>
    </Touchable>
  );
}

export const EpisodeTile = React.memo(EpisodeTileBase);
