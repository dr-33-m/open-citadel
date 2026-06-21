import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { Touchable } from '@/components/ui/touchable';
import { useColors } from '@/hooks/use-colors';
import { spacing } from '@/constants/theme';

type FabProps = {
  onPress?: () => void;
};

export function Fab({ onPress }: FabProps) {
  const colors = useColors();
  const styles = React.useMemo(() => StyleSheet.create({
    container: {
      position: 'absolute',
      bottom: spacing[10],
      right: spacing[6],
    },
    gradient: {
      width: 52,
      height: 52,
      alignItems: 'center',
      justifyContent: 'center',
    },
    icon: {
      fontSize: 28,
      color: colors.text.inverse,
      fontWeight: '300',
      marginTop: -2,
    },
  }), [colors]);

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
