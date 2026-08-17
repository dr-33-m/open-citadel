import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { Touchable } from '@/components/ui/touchable';
import { useColors } from '@/hooks/use-colors';
import { elevation, spacing } from '@/constants/theme';

type FabProps = {
  onPress?: () => void;
  /**
   * Extra clearance below the FAB's usual resting position — the tab screens
   * that use this sit behind a floating, absolutely-positioned nav bar, so
   * their own container now reaches the true screen bottom rather than
   * stopping above the bar. Pass `floatingTabBarHeight(insets.bottom)` from
   * `@/components/app-tabs` so the FAB clears the bar instead of sitting under it.
   */
  bottomOffset?: number;
};

export function Fab({ onPress, bottomOffset = 0 }: FabProps) {
  const colors = useColors();
  const styles = React.useMemo(() => StyleSheet.create({
    container: {
      position: 'absolute',
      bottom: spacing[10] + bottomOffset,
      right: spacing[6],
    },
    gradient: {
      width: 52,
      height: 52,
      alignItems: 'center',
      justifyContent: 'center',
      ...elevation.card,
    },
    icon: {
      fontSize: 28,
      color: colors.text.inverse,
      fontWeight: '300',
      marginTop: -2,
    },
  }), [colors, bottomOffset]);

  return (
    <Touchable onPress={onPress} style={styles.container}>
      <LinearGradient
        colors={[colors.primary.default, colors.primary.container]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <Text style={styles.icon}>+</Text>
      </LinearGradient>
    </Touchable>
  );
}
