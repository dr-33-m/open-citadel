import React from 'react';
import { View } from 'react-native';

import { Pause, Play } from '@/components/icons';
import { Spinner } from '@/components/ui/spinner';
import { Touchable } from '@/components/ui/touchable';
import { elevation } from '@/constants/theme';
import { SkipGlyph } from '@/features/podcasts/components/skip-glyph';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type PlayerTransportProps = {
  playing: boolean;
  buffering: boolean;
  skipBackSec: number;
  skipForwardSec: number;
  onToggle: () => void;
  onBack: () => void;
  onForward: () => void;
  /** The smaller set, under a transcript: the same three, sized to sit under a list. */
  compact?: boolean;
};

const SIZES = {
  full: { gap: 'gap-10', skip: 'h-16 w-16', skipIcon: 36, play: 'h-20 w-20', playIcon: 34 },
  compact: { gap: 'gap-8', skip: 'h-12 w-12', skipIcon: 28, play: 'h-14 w-14', playIcon: 24 },
} as const;

/**
 * Back, play, forward. Play is the gold square in the middle and the biggest
 * target on the screen, because it is the one pressed without looking; the
 * skips sit either side at thumb's reach.
 */
export function PlayerTransport({
  playing,
  buffering,
  skipBackSec,
  skipForwardSec,
  onToggle,
  onBack,
  onForward,
  compact = false,
}: PlayerTransportProps) {
  const tokens = useThemeTokens();
  const ink = tokens['--color-foreground'];
  const onGold = tokens['--color-background'];
  const Icon = playing ? Pause : Play;
  const size = SIZES[compact ? 'compact' : 'full'];

  return (
    <View className={`flex-row items-center justify-center ${size.gap}`}>
      <Touchable
        className={`${size.skip} items-center justify-center`}
        onPress={onBack}
        haptic="tap"
        accessibilityRole="button"
        accessibilityLabel={`Back ${skipBackSec} seconds`}
      >
        <SkipGlyph direction="back" seconds={skipBackSec} size={size.skipIcon} color={ink} />
      </Touchable>
      <Touchable
        className={`${size.play} items-center justify-center bg-primary`}
        style={elevation.card}
        onPress={onToggle}
        haptic="tap"
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause' : 'Play'}
      >
        {buffering ? <Spinner /> : <Icon size={size.playIcon} color={onGold} fill={onGold} />}
      </Touchable>
      <Touchable
        className={`${size.skip} items-center justify-center`}
        onPress={onForward}
        haptic="tap"
        accessibilityRole="button"
        accessibilityLabel={`Forward ${skipForwardSec} seconds`}
      >
        <SkipGlyph direction="forward" seconds={skipForwardSec} size={size.skipIcon} color={ink} />
      </Touchable>
    </View>
  );
}
