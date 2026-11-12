import React from 'react';
import { Pressable, StyleSheet, Text, View, type PressableStateCallbackType } from 'react-native';

import { fontFamily, typography } from '@/constants/theme';
import type { TranscriptLine } from '@/features/podcasts/utils/transcript-lines';
import { haptics } from '@/utils/haptics';

/** A line not being spoken, while the transcript follows the audio. */
const DIMMED = 0.42;
/** The marker lets the page through, as the reader's highlights do. */
const MARKER_ALPHA = '4D';
/** The house press dim. */
const PRESSED = 0.6;

export type TranscriptRowColors = {
  ink: string | undefined;
  gold: string | undefined;
  muted: string | undefined;
  band: string | undefined;
};

type TranscriptRowProps = {
  line: TranscriptLine;
  /** The line being spoken: its time gold, a gold rule beside it, at full strength. */
  lit: boolean;
  /** Following the audio: every other line steps back. */
  dim: boolean;
  /** The search match in hand: a band behind it so the eye finds it. */
  match: boolean;
  /** Highlighted: its colour, drawn as the marker behind its words, line by line, as in the reader. */
  mark?: string | null;
  /** Width of the time column, wide enough for "1:02:04" in a long episode. */
  gutter: number;
  colors: TranscriptRowColors;
  onPress: (line: TranscriptLine) => void;
  onLongPress: (line: TranscriptLine) => void;
  onHeading: (line: TranscriptLine) => void;
};

/**
 * One line of a transcript, read like lyrics: its time in a column of its
 * own, then the words in the serif. Where a speaker's turn begins, their name
 * heads it in gold; a tap there renames them. A tap on the line plays from
 * it; a long press opens its menu.
 *
 * Plain React Native on purpose: a list a finger flings through mounts these
 * by the dozen, so there is no animated node in a row (the app's `Touchable`
 * carries a UI-thread spring each, and three of them a line made a fast swipe
 * outrun the list and draw blank), no class names to parse, and every style
 * is made once. The spoken line changes instantly, as the list moves to it.
 */
export const TranscriptRow = React.memo(function TranscriptRow({
  line,
  lit,
  dim,
  match,
  mark = null,
  gutter,
  colors,
  onPress,
  onLongPress,
  onHeading,
}: TranscriptRowProps) {
  // A long press must not also play the line when the finger lifts. Cleared
  // as the next touch lands, or the first tap after a long press was lost.
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
    onPress(line);
  };
  const longPress = () => {
    held.current = true;
    haptics.commit();
    onLongPress(line);
  };
  const rowStyle = ({ pressed }: PressableStateCallbackType) => [
    styles.row,
    match && { backgroundColor: colors.band },
    pressed && styles.pressed,
  ];
  const label = `${line.time ? `${line.time}. ` : ''}${mark ? 'Highlighted. ' : ''}${line.text}`;

  return (
    <View>
      {line.heading ? (
        <View style={[styles.heading, { paddingLeft: styles.row.paddingHorizontal + gutter }]}>
          <Pressable
            disabled={line.speaker == null}
            onPress={() => onHeading(line)}
            hitSlop={8}
            style={({ pressed }) => pressed && styles.pressed}
            accessibilityRole="button"
            accessibilityLabel={`${line.heading}. Rename`}
          >
            <Text style={[typography.labelSm, { color: colors.gold }]}>{line.heading}</Text>
          </Pressable>
        </View>
      ) : null}
      <Pressable
        style={rowStyle}
        onPressIn={pressIn}
        onPress={press}
        onLongPress={longPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Plays from here"
        accessibilityState={{ selected: lit }}
      >
        {lit ? <View style={[styles.rule, { backgroundColor: colors.gold }]} /> : null}
        {line.time ? (
          <Text style={[typography.labelSm, styles.time, { width: gutter, color: lit ? colors.gold : colors.muted }]}>{line.time}</Text>
        ) : null}
        <Text style={[styles.words, { color: colors.ink }, dim && !lit && styles.dimmed]}>
          {mark ? <Text style={{ backgroundColor: `${mark}${MARKER_ALPHA}` }}>{line.text}</Text> : line.text}
        </Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', paddingRight: 24, paddingTop: 24, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'baseline', paddingHorizontal: 24, paddingVertical: 8 },
  pressed: { opacity: PRESSED },
  rule: { position: 'absolute', left: 0, top: 8, bottom: 8, width: 3 },
  time: { fontVariant: ['tabular-nums'] },
  // The serif, a size up from body, with room between the lines.
  words: { flex: 1, fontFamily: fontFamily.serif, fontSize: 19, lineHeight: 29 },
  dimmed: { opacity: DIMMED },
});
