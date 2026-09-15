import React from 'react';
import { useCSSVariable } from 'uniwind';
import type { MarkdownStyle } from 'react-native-enriched-markdown';

import { fontFamily, spacing } from '@/constants/theme';

/**
 * Which of Samwell's two voices the markdown is being spoken in.
 *
 * `sans` is the chat bubble, `serif` is Compass. They differ only in face and
 * size, so they share this one mapping rather than each keeping a copy of the
 * same twelve style keys — which is how the two drifted last time, the chat
 * bubble getting fixes that Compass did not.
 */
export type MarkdownVoice = 'sans' | 'serif';

/**
 * The faces each voice uses.
 *
 * This is the reason the mapping exists at all. The library adds a bold or
 * italic TRAIT on top of the block font by default, and this app's fonts are
 * named faces rather than one weight-varied family: asking Android to
 * embolden `Manrope_400Regular` gets you a synthesised smear, not
 * `Manrope_700Bold`. So every emphasis names its real face and turns the trait
 * off with `fontWeight: 'normal'` / `fontStyle: 'normal'`.
 *
 * With one exception, and it is deliberate. Manrope is loaded without an
 * italic face (see `useFonts` in `app/_layout`), so `sans` leaves `em` alone
 * and lets the trait synthesise. Naming a face that is not in the bundle would
 * silently fall back to the system font, which is worse than a slanted
 * Manrope.
 */
const VOICES = {
  sans: {
    body: fontFamily.sans,
    bold: fontFamily.sansBold,
    italic: null,
    heading: fontFamily.sansSemiBold,
    headingStrong: fontFamily.sansBold,
  },
  serif: {
    body: fontFamily.serif,
    bold: fontFamily.serifBold,
    italic: fontFamily.serifItalic,
    heading: fontFamily.serifMedium,
    headingStrong: fontFamily.serifMedium,
  },
} as const;

/**
 * Every style `EnrichedMarkdownText` needs, built from this app's tokens.
 *
 * The library ships light-mode defaults, so nothing here is optional: any key
 * left unset renders in a colour from someone else's palette. Both surfaces
 * pass the result straight to `markdownStyle`.
 *
 * Sizes come from the caller rather than from a scale here, because Compass's
 * draft cards size their own text and the chat bubble does not.
 */
export function useMarkdownStyle({
  voice,
  fontSize,
  lineHeight,
  color,
}: {
  voice: MarkdownVoice;
  fontSize: number;
  lineHeight: number;
  /** Overrides the foreground token, for a card that sets its own ink. */
  color?: string;
}): MarkdownStyle {
  const [foreground, primary, surfaceTertiary, mutedForeground] = useCSSVariable([
    '--color-foreground',
    '--color-primary',
    '--color-surface-tertiary',
    '--color-muted-foreground',
  ]);

  const text = color ?? (foreground as string);
  const face = VOICES[voice];

  return React.useMemo(
    () => ({
      // The base block style. Headings and lists inherit from it, so anything
      // they do not override lands here.
      paragraph: {
        fontFamily: face.body,
        fontSize,
        lineHeight,
        color: text,
        marginTop: 0,
        marginBottom: spacing[1],
      },
      h1: {
        fontFamily: face.headingStrong,
        fontSize: fontSize + 2,
        lineHeight: lineHeight + 2,
        color: text,
        marginTop: spacing[1],
        marginBottom: spacing[1],
      },
      h2: {
        fontFamily: face.heading,
        fontSize: fontSize + 1,
        lineHeight: lineHeight + 1,
        color: text,
        marginTop: spacing[1],
        marginBottom: spacing[1],
      },
      h3: {
        fontFamily: face.heading,
        fontSize,
        lineHeight,
        color: text,
        marginTop: spacing[1],
        marginBottom: 2,
      },
      /*
       * `itemSpacing` and `markerMinWidth` are the whole reason the old
       * `MarkdownListRenderer` existed: it drew the marker column by hand
       * because the previous library's list path left 405px of dead space
       * under any message containing one. This is that, natively.
       *
       * 22 matches the width that renderer reserved — enough for "10." before
       * it wraps — so a numbered list still lines up on its dots.
       */
      list: {
        fontFamily: face.body,
        fontSize,
        lineHeight,
        color: text,
        marginTop: spacing[1],
        marginBottom: spacing[1],
        markerMinWidth: 22,
        markerColor: text,
        bulletColor: text,
        itemSpacing: 2,
      },
      blockquote: {
        fontFamily: face.body,
        fontSize,
        lineHeight,
        color: mutedForeground as string,
        borderColor: primary as string,
        borderWidth: 2,
        gapWidth: spacing[3],
        marginTop: spacing[1],
        marginBottom: spacing[1],
      },
      code: {
        fontFamily: 'monospace',
        fontSize: fontSize - 2,
        color: text,
        backgroundColor: surfaceTertiary as string,
      },
      codeBlock: {
        fontFamily: 'monospace',
        fontSize: fontSize - 2,
        color: text,
        backgroundColor: surfaceTertiary as string,
        marginTop: spacing[1],
        marginBottom: spacing[1],
      },
      link: { color: primary as string, underline: false },
      // The trait is turned off because the face already carries the weight.
      strong: { fontFamily: face.bold, fontWeight: 'normal' as const, color: text },
      // Serif names its italic face; sans has none loaded and lets the trait
      // do it. See VOICES.
      em: face.italic
        ? { fontFamily: face.italic, fontStyle: 'normal' as const, color: text }
        : { color: text },
      thematicBreak: {
        color: surfaceTertiary as string,
        height: 1,
        marginTop: spacing[2],
        marginBottom: spacing[2],
      },
    }),
    [face, fontSize, lineHeight, text, primary, surfaceTertiary, mutedForeground],
  );
}
