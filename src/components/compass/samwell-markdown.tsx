import React, { Fragment, useMemo } from 'react';
import { View } from 'react-native';
import { useMarkdown } from 'react-native-marked';

import { MarkdownListRenderer } from '@/components/markdown-list-renderer';
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

  /*
   * The same renderer the chat bubbles use.
   *
   * Compass was on the stock one and carried both of its bugs: the trailing
   * gap under any message containing a list, and — because the library's list
   * item has no intrinsic width — a card that collapsed to its longest word
   * and wrapped mid-word. Two places render Samwell's markdown; they render it
   * the same way.
   */
  const renderer = useMemo(() => new MarkdownListRenderer(), []);

  const elements = useMarkdown(content, {
    renderer,
    styles: {
      text: { fontFamily: fontFamily.serif, fontSize, lineHeight },
      paragraph: { marginTop: 0, marginBottom: spacing[2] },
      h1: { fontFamily: fontFamily.serifMedium, fontSize: fontSize + 4, marginBottom: spacing[1] },
      h2: { fontFamily: fontFamily.serifMedium, fontSize: fontSize + 2, marginBottom: spacing[1] },
      h3: { fontFamily: fontFamily.serifMedium, fontSize: fontSize + 1, marginBottom: spacing[1] },
      list: { marginVertical: spacing[1] },
      // Without this the library's own 16/24 applies to list markers and item
      // text, so a list reads a size larger than the prose around it.
      li: { fontFamily: fontFamily.serif, fontSize, lineHeight },
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
