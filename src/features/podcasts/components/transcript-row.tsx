import React from 'react';
import { View, type TextStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { fontFamily } from '@/constants/theme';
import { useLineFade } from '@/features/podcasts/hooks/use-line-fade';
import type { TranscriptLine } from '@/features/podcasts/utils/transcript-lines';

/** A line not being spoken, while the transcript follows the audio. */
const DIMMED = 0.42;
/** The words: the serif, a size up from body, with room between the lines. */
const WORDS = { fontFamily: fontFamily.serif, fontSize: 19, lineHeight: 29 } as const;
const TIME: TextStyle = { fontVariant: ['tabular-nums'] };

type TranscriptRowProps = {
  line: TranscriptLine;
  /** The line being spoken: its time gold, a gold rule beside it, at full strength. */
  lit: boolean;
  /** Following the audio: every other line steps back. */
  dim: boolean;
  /** The search match in hand: a band behind it so the eye finds it. */
  match: boolean;
  /** Width of the time column, wide enough for "1:02:04" in a long episode. */
  gutter: number;
  gold: string | undefined;
  muted: string | undefined;
  onPress: (line: TranscriptLine) => void;
  onLongPress: (line: TranscriptLine) => void;
  onHeading: (line: TranscriptLine) => void;
};

/**
 * One line of a transcript, read like lyrics: its time in a column of its
 * own, then the words in the serif. Where a speaker's turn begins, their name
 * heads it in gold; a tap there renames them. A tap on the line plays from
 * it; a long press opens its menu.
 */
export const TranscriptRow = React.memo(function TranscriptRow({
  line,
  lit,
  dim,
  match,
  gutter,
  gold,
  muted,
  onPress,
  onLongPress,
  onHeading,
}: TranscriptRowProps) {
  const fade = useLineFade(line.index, dim && !lit ? DIMMED : 1);
  const timeColor = lit ? gold : muted;
  const label = line.time ? `${line.time}. ${line.text}` : line.text;

  return (
    <View>
      {line.heading ? (
        <View className="flex-row px-6 pb-1 pt-6" style={{ paddingLeft: 24 + gutter }}>
          <Touchable
            disabled={line.speaker == null}
            onPress={() => onHeading(line)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${line.heading}. Rename`}
          >
            <ThemedText type="labelSm" color={gold}>
              {line.heading}
            </ThemedText>
          </Touchable>
        </View>
      ) : null}
      <Touchable
        className={match ? 'flex-row items-baseline bg-muted px-6 py-2' : 'flex-row items-baseline px-6 py-2'}
        onPress={() => onPress(line)}
        onLongPress={() => onLongPress(line)}
        haptic="select"
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Plays from here"
        accessibilityState={{ selected: lit }}
      >
        {lit ? <View className="absolute bottom-2 left-0 top-2 w-[3px] bg-primary" /> : null}
        {line.time ? (
          <ThemedText type="labelSm" color={timeColor} style={[TIME, { width: gutter }]}>
            {line.time}
          </ThemedText>
        ) : null}
        <Animated.View className="flex-1" style={fade}>
          <ThemedText style={WORDS}>{line.text}</ThemedText>
        </Animated.View>
      </Touchable>
    </View>
  );
});
