import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useColors } from '@/hooks/use-colors';

type ProgressBarProps = {
  progress: number; // 0 to 1
};

export function ProgressBar({ progress }: ProgressBarProps) {
  const colors = useColors();
  const styles = React.useMemo(() => StyleSheet.create({
    track: {
      height: 3,
      backgroundColor: colors.surface.highest,
    },
    fill: {
      height: 3,
      backgroundColor: colors.primary.default,
    },
  }), [colors]);

  return (
    <View style={styles.track}>
      <View
        style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]}
      />
    </View>
  );
}
