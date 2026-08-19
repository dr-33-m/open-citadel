import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { easingCss, motion } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';

type ProgressBarProps = {
  progress: number; // 0 to 1
};

export function ProgressBar({ progress }: ProgressBarProps) {
  const colors = useColors();
  const clamped = Math.max(0, Math.min(progress, 1));

  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        track: {
          height: 3,
          backgroundColor: colors.surface.highest,
        },
        // Absolutely positioned and childless, which is the one case where
        // animating `width` is free: it's out of flow, so no sibling re-lays
        // out per frame. `scaleX` would be cheaper still but smears the fill's
        // edge, and width keeps it crisp.
        fill: {
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          backgroundColor: colors.primary.default,
          transitionProperty: 'width',
          transitionDuration: `${motion.slow}ms`,
          transitionTimingFunction: easingCss,
        },
      }),
    [colors],
  );

  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, { width: `${clamped * 100}%` }]} />
    </View>
  );
}
