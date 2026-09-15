import { Pause, Play, SkipBack, SkipForward } from '@/components/icons';
import React from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

import { Touchable } from '@/components/ui/touchable';

import { popIn, popOut } from '@/constants/theme';
import { asColor } from '@/utils/colors';

type TTSControlsProps = {
  isPlaying: boolean;
  onPlayPause: () => void;
  onSkipPrevious: () => void;
  onSkipNext: () => void;
};

export function TTSControls({
  isPlaying,
  onPlayPause,
  onSkipPrevious,
  onSkipNext,
}: TTSControlsProps) {
  // Literal values, not classes: these feed a lucide icon's `color` prop and
  // a Reanimated child, neither of which reads className.
  const [foregroundRaw, primaryRaw] = useCSSVariable(['--color-foreground', '--color-primary']);
  const foreground = asColor(foregroundRaw);
  const primary = asColor(primaryRaw);

  return (
    <View className="flex-row items-center justify-center gap-4">
      <Touchable
        onPress={onSkipPrevious}
        className="h-9 w-9 items-center justify-center border border-border bg-card shadow-sm"
        hitSlop={8}
        haptic="tap"
        accessibilityRole="button"
        accessibilityLabel="Previous"
      >
        <SkipBack size={16} color={foreground} strokeWidth={2} />
      </Touchable>
      <Touchable
        onPress={onPlayPause}
        // Bigger than its neighbours and squared like them. Transport controls
        // earn a size hierarchy — this is the one you reach for — but the round
        // pill was the last soft shape in the reader.
        className="h-11 w-11 items-center justify-center border border-border bg-card shadow-sm"
        hitSlop={8}
        haptic="tap"
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
      >
        {/* Keyed on play state: the glyph pops out and the new one pops in,
            rather than swapping instantly. */}
        {isPlaying ? (
          <Animated.View
            key="pause"
            entering={popIn()}
            exiting={popOut()}
          >
            <Pause size={20} color={primary} />
          </Animated.View>
        ) : (
          <Animated.View
            key="play"
            entering={popIn()}
            exiting={popOut()}
          >
            <Play size={20} color={primary} />
          </Animated.View>
        )}
      </Touchable>
      <Touchable
        onPress={onSkipNext}
        className="h-9 w-9 items-center justify-center border border-border bg-card shadow-sm"
        hitSlop={8}
        haptic="tap"
        accessibilityRole="button"
        accessibilityLabel="Next"
      >
        <SkipForward size={16} color={foreground} strokeWidth={2} />
      </Touchable>
    </View>
  );
}
