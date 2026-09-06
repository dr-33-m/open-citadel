import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Touchable } from '@/components/ui/touchable';

import { ThemedText } from '@/components/themed-text';
import { asColor } from '@/utils/colors';
import { spacing } from '@/constants/theme';

type GoldButtonProps = {
  label: string;
  onPress?: () => void;
  /**
   * How much of a commitment the press is.
   *
   * `full` is the 56pt bar this started as, and it is right where the button
   * IS the screen's purpose: ADD BOOKS, SAVE, pick a library folder. It got
   * used for a dialog's dismiss as well, and at that size a button whose whole
   * job is "yes, I have read this" shouted louder than the thing it was
   * dismissing.
   *
   * `compact` is the size every other button in the app is — the same 40pt box
   * as FINISH GOAL and MAKE THIS THE MAIN GOAL — for an acknowledgement, or
   * for a gold button sharing a row with other controls.
   */
  size?: 'full' | 'compact';
  /**
   * Nothing to commit yet — an empty note, a blank title.
   *
   * Dims the gradient and stops the press reaching through, rather than
   * letting the button answer with its commit haptic and then do nothing.
   * A control that looks live and silently no-ops reads as broken.
   */
  disabled?: boolean;
};

export function GoldButton({
  label,
  onPress,
  size = 'full',
  disabled = false,
}: GoldButtonProps) {
  const [primary, primaryDeep, primaryForeground] = useCSSVariable([
    '--color-primary',
    '--color-primary-deep',
    '--color-primary-foreground',
  ]);
  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        full: {
          minHeight: 56,
          paddingHorizontal: spacing[6],
          alignItems: 'center',
          justifyContent: 'center',
        },
        compact: {
          minHeight: 40,
          paddingHorizontal: spacing[5],
          alignItems: 'center',
          justifyContent: 'center',
        },
      }),
    [],
  );

  return (
    <Touchable
      onPress={onPress}
      disabled={disabled}
      haptic="commit"
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={label}
    >
      <LinearGradient
        colors={[asColor(primary)!, asColor(primaryDeep)!]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        // The fade goes on the gradient, not on the Touchable above it:
        // `AnimatedPressable` animates opacity on the UI thread and Reanimated
        // overwrites any static value set there.
        style={[
          size === 'compact' ? styles.compact : styles.full,
          disabled ? { opacity: 0.35 } : null,
        ]}
      >
        <ThemedText
          type={size === 'compact' ? 'labelMd' : 'labelLg'}
          color={asColor(primaryForeground)}
        >
          {label}
        </ThemedText>
      </LinearGradient>
    </Touchable>
  );
}
