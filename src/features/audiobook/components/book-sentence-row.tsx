import React from 'react';
import { Pressable, StyleSheet, Text, View, type PressableStateCallbackType } from 'react-native';

import { fontFamily } from '@/constants/theme';
import type { SentenceRow } from '@/features/audiobook/utils/sentence-rows';
import { haptics } from '@/utils/haptics';

/** A sentence not being heard, while the text follows the voice. */
const DIMMED = 0.42;
/** The marker lets the page through, as the reader's highlights do. */
const MARKER_ALPHA = '4D';
/** The house press dim. */
const PRESSED = 0.6;

export type BookRowColors = { ink: string | undefined; gold: string | undefined };

type BookSentenceRowProps = {
  row: SentenceRow;
  /** The sentence being spoken: a gold rule beside it, at full strength. */
  lit: boolean;
  /** Following the voice: every other sentence steps back. */
  dim: boolean;
  /** Highlighted in the book: its colour, drawn as the marker behind its words, as in the reader. */
  mark: string | null;
  colors: BookRowColors;
  onSentence: (sentenceId: string) => void;
  /** Its menu, or its highlight's sheet when it has one. */
  onLongPress: (sentenceId: string) => void;
};

/**
 * One sentence of the book in the follow-along sheet, drawn as a transcript's
 * line is (`TranscriptRow`): the serif, a gold rule beside the one being
 * spoken, the rest stepped back while following. A paragraph's first
 * sentence has room above it, so the chapter still reads in paragraphs. A tap
 * plays from it; a long press opens its menu, or its highlight's sheet.
 *
 * Plain React Native, as the transcript's rows are: a list a finger flings
 * through mounts these by the dozen. Memoised, so a new sentence redraws two
 * rows, not the list.
 */
export const BookSentenceRow = React.memo(function BookSentenceRow({ row, lit, dim, mark, colors, onSentence, onLongPress }: BookSentenceRowProps) {
  const { sentence } = row;
  // A long press must not also play from the sentence when the finger lifts.
  const held = React.useRef(false);
  const pressIn = () => {
    held.current = false;
  };
  const press = () => {
    if (held.current) {
      held.current = false;
      return;
    }
    haptics.select();
    onSentence(sentence.id);
  };
  const longPress = () => {
    held.current = true;
    haptics.commit();
    onLongPress(sentence.id);
  };
  const rowStyle = ({ pressed }: PressableStateCallbackType) => [styles.row, row.opensParagraph && styles.opens, pressed && styles.pressed];
  const marker = mark ? { backgroundColor: `${mark}${MARKER_ALPHA}` } : null;

  return (
    <Pressable
      style={rowStyle}
      onPressIn={pressIn}
      onPress={press}
      onLongPress={longPress}
      accessibilityRole="button"
      accessibilityLabel={`${mark ? 'Highlighted. ' : ''}${sentence.text}`}
      accessibilityHint="Plays from here"
      accessibilityState={{ selected: lit }}
    >
      {lit ? <View style={[styles.rule, row.opensParagraph && styles.ruleOpens, { backgroundColor: colors.gold }]} /> : null}
      <Text style={[styles.words, { color: colors.ink }, dim && !lit && styles.dimmed]}>
        {marker ? <Text style={marker}>{sentence.text}</Text> : sentence.text}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { paddingHorizontal: 24, paddingVertical: 4 },
  // A paragraph's first sentence: the break between paragraphs.
  opens: { paddingTop: 20 },
  pressed: { opacity: PRESSED },
  rule: { position: 'absolute', left: 0, top: 4, bottom: 4, width: 3 },
  ruleOpens: { top: 20 },
  // The serif, a size up from body, with room between the lines: the transcript's measure.
  words: { fontFamily: fontFamily.serif, fontSize: 19, lineHeight: 29 },
  dimmed: { opacity: DIMMED },
});
