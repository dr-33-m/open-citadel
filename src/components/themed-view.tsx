import React from 'react';
import { View, type ViewProps } from 'react-native';

import { useColors } from '@/hooks/use-colors';
import type { AppColors } from '@/constants/theme';

type SurfaceLevel = keyof AppColors['surface'];

export type ThemedViewProps = ViewProps & {
  surface?: SurfaceLevel;
};

export function ThemedView({
  style,
  surface = 'base',
  ...otherProps
}: ThemedViewProps) {
  const colors = useColors();
  return (
    <View
      style={[{ backgroundColor: colors.surface[surface] }, style]}
      {...otherProps}
    />
  );
}
