import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { fontFamily } from '@/constants/theme';
import type { ParagraphRow } from '@/features/audiobook/utils/paragraph-rows';
import { haptics } from '@/utils/haptics';

/** A paragraph not being heard, while the text follows the voice. */
const DIMMED = 0.42;
/** The marker lets the page through, as the reader's highlights do. */
const MARKER_ALPHA = '4D';

export type BookRowColors = { ink: string | undefined; gold: string | undefined };

type BookParagraphRowProps = {
  row: ParagraphRow;
  /** The sentence being spoken, when it is in this paragraph; null otherwise, so other rows keep their props. */
  lit: string | null;
  /** Following the voice: every other paragraph steps back. */
  dim: boolean;
  colors: BookRowColors;
  onSentence: (sentenceId: string) => void;
};

/**
 * One paragraph of the book in the follow-along sheet, in the reader's serif.
 * The sentence being spoken carries the reader's gold marker; the rest of its
 * paragraph is at full ink, and the other paragraphs step back. Each sentence
 * is its own span, so a tap on one goes there.
 *
 * Plain React Native, as the transcript's rows are: a list a finger flings
 * through mounts these by the dozen. Memoised on the paragraph and whether
 * the voice is in it, so a new sentence redraws two rows, not the list.
 */
export const BookParagraphRow = React.memo(function BookParagraphRow({ row, lit, dim, colors, onSentence }: BookParagraphRowProps) {
  const marker = colors.gold ? { backgroundColor: `${colors.gold}${MARKER_ALPHA}` } : null;
  return (
    <View style={styles.row}>
      <Text style={[styles.words, { color: colors.ink }, dim && lit === null && styles.dimmed]}>
        {row.sentences.map((sentence, i) => (
          <Text
            key={sentence.id}
            onPress={() => {
              haptics.select();
              onSentence(sentence.id);
            }}
            accessibilityRole="button"
            accessibilityHint="Plays from here"
            accessibilityState={{ selected: sentence.id === lit }}
            style={sentence.id === lit ? marker : undefined}
          >
            {i > 0 ? ' ' : ''}
            {sentence.text}
          </Text>
        ))}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { paddingHorizontal: 24, paddingVertical: 10 },
  // The serif, a size up from body, with room between the lines: the transcript's measure.
  words: { fontFamily: fontFamily.serif, fontSize: 19, lineHeight: 30 },
  dimmed: { opacity: DIMMED },
});
