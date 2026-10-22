import React from 'react';

import { Pause, Play } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Spinner } from '@/components/ui/spinner';
import { Touchable } from '@/components/ui/touchable';
import { playLabel } from '@/features/podcasts/utils/format';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { EpisodeItem } from '@/services/podcasts/records';
import { useEpisodeBuffering, useEpisodePlayback } from '@/stores/player';

type PlayChipProps = {
  episode: Pick<EpisodeItem, 'id' | 'positionSec' | 'durationSec' | 'playState'>;
  onPress: (episodeId: string) => void;
};

/**
 * Play, with what pressing it means: the length before an episode is started,
 * what is left once it is, "Played" after. Pause while it is the one playing.
 *
 * It reads its own episode's playback state rather than taking it as a prop:
 * a list of these would otherwise re-render every row when anything starts or
 * stops. The selector returns this episode's state only, so one row redraws.
 */
function PlayChipBase({ episode, onPress }: PlayChipProps) {
  const tokens = useThemeTokens();
  const status = useEpisodePlayback(episode.id);
  const buffering = useEpisodeBuffering(episode.id);
  const active = status !== 'idle';
  const Icon = status === 'playing' ? Pause : Play;
  const tint = active ? tokens['--color-primary'] : tokens['--color-foreground'];
  const label = status === 'playing' ? 'Playing' : playLabel(episode);

  return (
    <Touchable
      className="flex-row items-center gap-1.5 self-start border border-border bg-muted px-2.5 py-1.5"
      onPress={() => onPress(episode.id)}
      haptic="tap"
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={status === 'playing' ? 'Pause' : `Play, ${label}`}
    >
      {buffering ? <Spinner size="sm" /> : <Icon size={12} color={tint} fill={tint} />}
      <ThemedText type="labelSm" color={active ? tint : tokens['--color-muted-foreground']} numberOfLines={1}>
        {label}
      </ThemedText>
    </Touchable>
  );
}

export const PlayChip = React.memo(PlayChipBase);
