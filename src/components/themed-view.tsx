import { View, type ViewProps } from 'react-native';

import { colors } from '@/constants/theme';

type SurfaceLevel = keyof typeof colors.surface;

export type ThemedViewProps = ViewProps & {
  surface?: SurfaceLevel;
};

export function ThemedView({
  style,
  surface = 'base',
  ...otherProps
}: ThemedViewProps) {
  return (
    <View
      style={[{ backgroundColor: colors.surface[surface] }, style]}
      {...otherProps}
    />
  );
}
