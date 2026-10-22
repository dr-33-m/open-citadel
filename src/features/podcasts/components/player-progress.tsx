import React from 'react';
import { View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { PlayerScrubber } from '@/features/podcasts/components/player-scrubber';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type PlayerProgressProps = {
  chapterTitle: string | null;
  /** The chapter list opens from here, so it is said even before the first chapter starts. */
  hasChapters: boolean;
  position: SharedValue<number>;
  duration: SharedValue<number>;
  /** Between the scrubber's two times, when there is something to say there. */
  middleLabel?: string | null;
  error: string | null;
  onChapters: () => void;
  onSeek: (seconds: number) => void;
  /** Takes touches. False while the player is still opening. */
  live: boolean;
};

/** Where the listener is: the chapter playing (which opens the list), the scrubber, and why playback stopped, if it did. */
export function PlayerProgress({ chapterTitle, hasChapters, position, duration, middleLabel = null, error, onChapters, onSeek, live }: PlayerProgressProps) {
  const tokens = useThemeTokens();
  const chapter = chapterTitle ?? (hasChapters ? 'Chapters' : null);
  return (
    <View className="gap-1">
      {chapter ? (
        <Touchable onPress={onChapters} accessibilityRole="button" accessibilityLabel="Chapters">
          <ThemedText type="labelSm" color={tokens['--color-primary']} numberOfLines={1}>
            {chapter}
          </ThemedText>
        </Touchable>
      ) : null}
      <PlayerScrubber position={position} duration={duration} onSeek={onSeek} live={live} middleLabel={middleLabel} />
      {error ? (
        <ThemedText type="bodySm" color={tokens['--color-muted-foreground']}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}
