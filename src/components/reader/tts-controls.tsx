import { Pause, Play, SkipBack, SkipForward } from 'lucide-react-native';
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
        className="h-9 w-9 items-center justify-center rounded-full bg-muted"
        hitSlop={8}
        haptic="tap"
      >
        <SkipBack size={16} color={foreground} />
      </Touchable>
      <Touchable
        onPress={onPlayPause}
        className="h-11 w-11 items-center justify-center rounded-full bg-muted"
        hitSlop={8}
        haptic="tap"
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
        className="h-9 w-9 items-center justify-center rounded-full bg-muted"
        hitSlop={8}
        haptic="tap"
      >
        <SkipForward size={16} color={foreground} />
      </Touchable>
    </View>
  );
}
