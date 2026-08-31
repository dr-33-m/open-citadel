import React, { Fragment } from 'react';
import { View } from 'react-native';
import { useMarkdown } from 'react-native-marked';
import { useCSSVariable } from 'uniwind';

import { fontFamily, spacing } from '@/constants/theme';

type SamwellMarkdownProps = {
  content: string;
  fontSize?: number;
  lineHeight?: number;
  color?: string;
};

/**
 * These tokens are always declared in `theme.css`, so the CSS-variable
 * lookup never actually resolves to `undefined` here — the cast only
 * satisfies react-native-marked's `ColorsPropType`, whose fields are typed
 * as required `ColorValue`, not `string | undefined`.
 */
function asColor(value: string | number | undefined): string {
  return value as string;
}

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
  const foregroundVar = useCSSVariable('--color-foreground');
  const primaryVar = useCSSVariable('--color-primary');
  const surfaceTertiaryVar = useCSSVariable('--color-surface-tertiary');
  const textColor = color ?? asColor(foregroundVar);

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
        link: asColor(primaryVar),
        code: asColor(surfaceTertiaryVar),
        border: asColor(surfaceTertiaryVar),
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
