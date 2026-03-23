import { Text, type TextProps } from 'react-native';

import { colors, typography, type TypographyVariant } from '@/constants/theme';

export type ThemedTextProps = TextProps & {
  type?: TypographyVariant;
  color?: string;
  italic?: boolean;
};

export function ThemedText({
  style,
  type = 'bodyMd',
  color = colors.text.primary,
  italic,
  ...rest
}: ThemedTextProps) {
  const typeStyle = typography[type];

  return (
    <Text
      style={[
        typeStyle,
        { color },
        italic && { fontStyle: 'italic' as const },
        style,
      ]}
      {...rest}
    />
  );
}
