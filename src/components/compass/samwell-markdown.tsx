import React, { Fragment } from 'react';
import { View } from 'react-native';
import { useMarkdown } from 'react-native-marked';

import { fontFamily, spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';

type SamwellMarkdownProps = {
  content: string;
  fontSize?: number;
  lineHeight?: number;
  color?: string;
};

/**
 * Renders one of Grand Maester Samwell's messages as markdown, in his serif
 * voice. Same engine the chat bubbles use (react-native-marked), so lists,
 * emphasis and headings render instead of showing raw asterisks.
 */
export function SamwellMarkdown({
  content,
  fontSize = 16,
  lineHeight = 24,
  color,
}: SamwellMarkdownProps) {
  const colors = useColors();
  const textColor = color ?? colors.text.primary;

  const elements = useMarkdown(content, {
    styles: {
      text: { fontFamily: fontFamily.serif, fontSize, lineHeight },
      paragraph: { marginTop: 0, marginBottom: spacing[2] },
      h1: { fontFamily: fontFamily.serifMedium, fontSize: fontSize + 4, marginBottom: spacing[1] },
      h2: { fontFamily: fontFamily.serifMedium, fontSize: fontSize + 2, marginBottom: spacing[1] },
      h3: { fontFamily: fontFamily.serifMedium, fontSize: fontSize + 1, marginBottom: spacing[1] },
      list: { marginVertical: spacing[1] },
      blockquote: {
        paddingHorizontal: spacing[3],
        paddingVertical: spacing[1],
        marginVertical: spacing[1],
      },
      codespan: { fontFamily: 'monospace', fontSize: fontSize - 2 },
    },
    theme: {
      colors: {
        text: textColor,
        link: colors.primary.default,
        code: colors.surface.highest,
        border: colors.surface.highest,
      },
    },
  });

  return (
    <View>
      {elements.map((el, i) => (
        <Fragment key={i}>{el}</Fragment>
      ))}
    </View>
  );
}
