import React from 'react';

import { useCSSVariable } from 'uniwind';

import { ThemedText, type ThemedTextProps } from '@/components/themed-text';
import { asColor } from '@/utils/colors';

/**
 * His name, and the long form first so the longer match wins.
 *
 * Capturing, because `split` on a capturing pattern keeps the separators in
 * the result — which is what lets one pass produce both the plain pieces and
 * the name pieces in order, with no second scan and no index arithmetic.
 */
const NAME = /(Grand Maester Samwell|Samwell)/;

type SamwellTextProps = Omit<ThemedTextProps, 'children'> & {
  /** A sentence. His name inside it is picked out; everything else is not. */
  children: string;
};

/**
 * A line of text with Samwell's name in the app's gold.
 *
 * He is the one character in the app, and the gold is his everywhere else —
 * his mark in the Library header, the tip alerts, the ring on the control
 * unit's Compass cell. His name was the exception, running as ordinary body
 * text in twenty-odd sentences, so the word did less work than the icon of
 * the same thing sitting a few pixels away.
 *
 * Splitting rather than tinting the whole line, because most of these
 * sentences are ABOUT him rather than from him: "Samwell is offline. Wake him
 * up to chat." is one instruction with one proper noun in it, and colouring
 * all of it would make a banner out of a sentence.
 *
 * The name span sets only its colour, so it inherits the size, weight and
 * italics of whatever text component it is nested in. That is what lets
 * `useSamwellSpans` drop the same treatment into PanelUI's own text —
 * `EmptyState.Description` and the like — which `SamwellText` cannot wrap.
 *
 * Text-only. A placeholder inside a `TextInput` is a single string with a
 * single colour and cannot carry a span, so the composer's "Message Samwell…"
 * stays muted — which is right anyway, since placeholder text is meant to
 * recede.
 */
export function useSamwellSpans(text: string): React.ReactNode[] {
  // `useCSSVariable`, not the shared `useThemeTokens` context: that one
  // carries five tokens on purpose, and these appear in a handful of sentences
  // rather than in a list of hundreds of rows.
  const gold = asColor(useCSSVariable('--color-primary'));

  return React.useMemo(
    () =>
      text
        .split(NAME)
        .map((part, index) =>
          // `split` on a capturing pattern puts the matches at the odd
          // indices, so the name is found by position rather than by testing
          // each piece against the pattern again.
          index % 2 === 1 ? (
            <ThemedText key={index} color={gold}>
              {part}
            </ThemedText>
          ) : (
            part
          ),
        ),
    [text, gold],
  );
}

export function SamwellText({ children, ...rest }: SamwellTextProps) {
  const spans = useSamwellSpans(children);
  return <ThemedText {...rest}>{spans}</ThemedText>;
}
