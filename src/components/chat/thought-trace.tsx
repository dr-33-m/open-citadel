import React from 'react';
import { View, type TextStyle, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { fontFamily } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { cn } from '@/lib/cn';
import { thoughtBeats } from '@/utils/thought-beats';

/** The square that marks each end of the trace. */
const MARK = 7;
/** Where the text starts, so the labels at the ends and the beats between line up. */
const INDENT = 22;
/** The rail runs through the middle of the marks. */
const RAIL: ViewStyle = { marginLeft: (MARK - 1) / 2, paddingLeft: INDENT - (MARK - 1) / 2 - 1 };
const MARK_STYLE: ViewStyle = { width: MARK, height: MARK };
const LABEL_GAP: ViewStyle = { gap: INDENT - MARK };
/** His thinking in the serif's italic: his inner voice, set apart from the answer's sans. */
const VOICE: TextStyle = { fontFamily: fontFamily.serifItalic };
const TITLE: TextStyle = { fontFamily: fontFamily.sansSemiBold };

function End({ label, filled, muted }: { label: string; filled: boolean; muted: string | undefined }) {
  return (
    <View className="flex-row items-center" style={LABEL_GAP}>
      <View style={MARK_STYLE} className={cn('border border-primary', filled ? 'bg-primary' : 'bg-popover')} />
      <ThemedText type="labelSm" color={muted}>
        {label}
      </ThemedText>
    </View>
  );
}

/**
 * A reasoning trace drawn as the stretch of time it was: an open square where
 * he began, a thin rail down the beats he worked through (a paragraph each,
 * titled where the brain titled it), and a filled square where he stopped
 * thinking and answered. The serif's italic says it is thought, not reply.
 */
export const ThoughtTrace = React.memo(function ThoughtTrace({ text }: { text: string }) {
  const tokens = useThemeTokens();
  const muted = tokens['--color-muted-foreground'];
  const beats = React.useMemo(() => thoughtBeats(text), [text]);

  return (
    <View accessibilityLabel="What Samwell thought">
      <End label="STARTED" filled={false} muted={muted} />
      <View className="gap-4 border-s border-border py-4" style={RAIL}>
        {beats.map((beat, index) => (
          <View key={index} className="gap-1">
            {beat.title ? (
              <ThemedText type="bodySm" style={TITLE}>
                {beat.title}
              </ThemedText>
            ) : null}
            {beat.body ? (
              <ThemedText type="bodyMd" color={muted} style={VOICE}>
                {beat.body}
              </ThemedText>
            ) : null}
          </View>
        ))}
      </View>
      <End label="ANSWERED" filled muted={muted} />
    </View>
  );
});
