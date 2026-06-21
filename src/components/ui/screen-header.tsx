import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { fontFamily, spacing } from '@/constants/theme';
import { Touchable } from '@/components/ui/touchable';

type ScreenHeaderProps = {
  title: string;
  onRightPress?: () => void;
  rightIcon?: React.ReactNode;
  titleItalic?: boolean;
};

export function ScreenHeader({
  title,
  onRightPress,
  rightIcon,
  titleItalic = false,
}: ScreenHeaderProps) {
  const styles = React.useMemo(() => StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing[6],
      paddingVertical: spacing[4],
    },
    title: {
      flex: 1,
      textAlign: 'center',
    },
    iconButton: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
  }), []);

  return (
    <View style={styles.container}>
      <ThemedText
        type="headlineSm"
        style={[
          styles.title,
          titleItalic && { fontFamily: fontFamily.serifItalic },
        ]}
      >
        {title}
      </ThemedText>

      <Touchable onPress={onRightPress} style={styles.iconButton}>
        {rightIcon}
      </Touchable>
    </View>
  );
}
