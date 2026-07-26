import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { fontFamily, spacing } from '@/constants/theme';
import { Touchable } from '@/components/ui/touchable';
import { useColors } from '@/hooks/use-colors';

type ScreenHeaderProps = {
  title: string;
  /** Only rendered in `align="left"` mode. */
  subtitle?: string;
  onRightPress?: () => void;
  rightIcon?: React.ReactNode;
  titleItalic?: boolean;
  /** 'center' (default) preserves the original centered-title layout.
   * 'left' is the Citadel Frame treatment: left-aligned title + subtitle,
   * with the right accessory restyled into a bordered icon box. */
  align?: 'left' | 'center';
};

export function ScreenHeader({
  title,
  subtitle,
  onRightPress,
  rightIcon,
  titleItalic = false,
  align = 'center',
}: ScreenHeaderProps) {
  const colors = useColors();
  const styles = React.useMemo(() => StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing[6],
      paddingVertical: spacing[4],
    },
    centerTitle: {
      flex: 1,
      textAlign: 'center',
    },
    iconButton: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconBox: {
      width: 40,
      height: 40,
      borderWidth: 1,
      borderColor: colors.outline.variant,
      alignItems: 'center',
      justifyContent: 'center',
    },
  }), [colors]);

  if (align === 'left') {
    return (
      <View style={styles.container}>
        <View>
          <ThemedText
            type="headlineLg"
            style={titleItalic ? { fontFamily: fontFamily.serifItalic } : undefined}
          >
            {title}
          </ThemedText>
          {subtitle && (
            <ThemedText type="bodySm" color={colors.text.secondary}>
              {subtitle}
            </ThemedText>
          )}
        </View>

        {rightIcon != null && (
          onRightPress ? (
            <Touchable onPress={onRightPress} style={styles.iconBox}>
              {rightIcon}
            </Touchable>
          ) : (
            <View style={styles.iconBox}>{rightIcon}</View>
          )
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ThemedText
        type="headlineSm"
        style={[
          styles.centerTitle,
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
