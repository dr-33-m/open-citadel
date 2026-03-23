import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { fontFamily, spacing } from '@/constants/theme';

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

      <Pressable onPress={onRightPress} style={styles.iconButton}>
        {rightIcon}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
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
});
