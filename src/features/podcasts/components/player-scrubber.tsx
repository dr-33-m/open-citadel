import React from 'react';
import { View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { type SharedValue } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ClockText } from '@/features/podcasts/components/clock-text';
import { useScrubber } from '@/features/podcasts/hooks/use-scrubber';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

const THUMB = 14;
const TRACK = 4;

type PlayerScrubberProps = {
  position: SharedValue<number>;
  duration: SharedValue<number>;
  onSeek: (seconds: number) => void;
  /** Takes touches. False while the player is still opening. */
  live: boolean;
  /** Between the two times: a book's time left, in words. */
  middleLabel?: string | null;
};

/** Where the episode is, and the way to move it. The behaviour is `useScrubber`'s. */
export function PlayerScrubber({ position, duration, onSeek, live, middleLabel = null }: PlayerScrubberProps) {
  const tokens = useThemeTokens();
  const muted = tokens['--color-muted-foreground'];
  const scrubber = useScrubber(position, duration, onSeek, THUMB, live);

  return (
    <View className="gap-2">
      <GestureDetector gesture={scrubber.gesture}>
        <View
          className="h-8 justify-center"
          onLayout={scrubber.onLayout}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Playback position"
        >
          <Animated.View className="overflow-hidden bg-muted" style={[{ height: TRACK }, scrubber.trackStyle]}>
            <Animated.View className="h-full w-full bg-primary" style={[FILL_ORIGIN, scrubber.fillStyle]} />
          </Animated.View>
          <Animated.View pointerEvents="none" className="absolute bg-primary" style={[THUMB_BOX, scrubber.thumbStyle]} />
        </View>
      </GestureDetector>
      <View className="flex-row items-center justify-between">
        <ClockText text={scrubber.elapsedText} color={muted} align="left" />
        {middleLabel ? (
          <ThemedText type="labelSm" color={muted} numberOfLines={1} className="flex-1 text-center">
            {middleLabel}
          </ThemedText>
        ) : null}
        <ClockText text={scrubber.remainingText} color={muted} align="right" />
      </View>
    </View>
  );
}

const FILL_ORIGIN = { transformOrigin: 'left' } as const;
const THUMB_BOX = { width: THUMB, height: THUMB, left: 0 };
