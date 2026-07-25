import type { LucideIcon } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useColors } from '@/hooks/use-colors';
import { iconSize } from '@/constants/theme';

type PrefixIconProps = {
  icon: LucideIcon;
  size?: number;
  color?: string;
};

/**
 * The square, 1px-bordered icon badge that leads a list row — first established
 * on the Compass telemetry strips. House convention for "here's what this row is
 * about" going forward, in place of bare rows or ad-hoc icon treatments.
 */
export function PrefixIcon({ icon: Icon, size = 40, color }: PrefixIconProps) {
  const colors = useColors();
  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        badge: {
          width: size,
          height: size,
          borderWidth: 1,
          borderColor: colors.outline.variant,
          alignItems: 'center',
          justifyContent: 'center',
        },
      }),
    [colors, size],
  );

  return (
    <View style={styles.badge}>
      <Icon size={iconSize.default} color={color ?? colors.text.primary} strokeWidth={2} />
    </View>
  );
}
