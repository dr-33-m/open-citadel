import React from 'react';
import { Text, type TextProps } from 'react-native';

import { useColors } from '@/hooks/use-colors';
import { typography, type TypographyVariant } from '@/constants/theme';

export type ThemedTextProps = TextProps & {
  type?: TypographyVariant;
  color?: string;
  italic?: boolean;
};

export function ThemedText({
  style,
  type = 'bodyMd',
  color,
  italic,
  ...rest
}: ThemedTextProps) {
  const colors = useColors();
  const resolvedColor = color !== undefined ? color : colors.text.primary;
  const typeStyle = typography[type];

  return (
    <Text
      style={[
        typeStyle,
        { color: resolvedColor },
        italic && { fontStyle: 'italic' },
        style,
      ]}
      {...rest}
    />
  );
}
