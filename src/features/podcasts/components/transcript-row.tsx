import React from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import type { TranscriptRow as Row } from '@/features/podcasts/utils/transcript-rows';

type TranscriptRowProps = {
  row: Row;
  /** The line being spoken: gold. */
  lit: boolean;
  /** The search match in hand: marked so the eye finds it. */
  match: boolean;
  gold: string | undefined;
  muted: string | undefined;
  onPress: (index: number) => void;
  onLongPress: (index: number) => void;
  onSpeaker: (index: number) => void;
};

/**
 * One line of a transcript: the speaker and time in small caps where a
 * speaker's block opens, then the words. A tap plays from here; the name is
 * its own target, to correct it.
 */
export const TranscriptRow = React.memo(function TranscriptRow({ row, lit, match, gold, muted, onPress, onLongPress, onSpeaker }: TranscriptRowProps) {
  const color = lit ? gold : undefined;
  return (
    <Touchable
      className="gap-1 px-6 py-2"
      style={match ? { borderLeftWidth: 2, borderLeftColor: gold } : undefined}
      onPress={() => onPress(row.index)}
      onLongPress={() => onLongPress(row.index)}
      accessibilityRole="button"
      accessibilityHint="Plays from here"
    >
      {row.label ? (
        <View className="flex-row pt-3">
          <Touchable
            disabled={row.speaker == null}
            onPress={() => onSpeaker(row.index)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Rename ${row.label}`}
          >
            <ThemedText type="labelSm" color={lit ? gold : muted} style={{ fontVariant: ['tabular-nums'] }}>
              {row.label}
            </ThemedText>
          </Touchable>
        </View>
      ) : null}
      <ThemedText type="bodyMd" color={color}>
        {row.text}
      </ThemedText>
    </Touchable>
  );
});
