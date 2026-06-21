import { Pause, Play, SkipBack, SkipForward } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Touchable } from '@/components/ui/touchable';

import { useColors } from '@/hooks/use-colors';
import { spacing } from '@/constants/theme';

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
  const colors = useColors();

  const styles = React.useMemo(() => StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing[4],
    },
    btn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.surface.mid,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnPrimary: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.surface.mid,
      alignItems: 'center',
      justifyContent: 'center',
    },
  }), [colors]);

  return (
    <View style={styles.row}>
      <Touchable onPress={onSkipPrevious} style={styles.btn} hitSlop={8}>
        <SkipBack size={20} color={colors.text.primary} />
      </Touchable>
      <Touchable onPress={onPlayPause} style={styles.btnPrimary} hitSlop={8}>
        {isPlaying ? (
          <Pause size={26} color={colors.primary.default} />
        ) : (
          <Play size={26} color={colors.primary.default} />
        )}
      </Touchable>
      <Touchable onPress={onSkipNext} style={styles.btn} hitSlop={8}>
        <SkipForward size={20} color={colors.text.primary} />
      </Touchable>
    </View>
  );
}
