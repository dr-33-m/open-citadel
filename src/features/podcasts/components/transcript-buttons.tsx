import React from 'react';
import { View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import { ScrollText, ZodiacPisces } from '@/components/icons';
import { ProgressOutline } from '@/components/progress-outline';
import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

export type TranscriptButtonsProps = {
  transcriptLabel: string;
  /** 0 to 1 while a job runs, drawn as the square outline filling in; null otherwise. */
  progress: number | null;
  samwellLabel: string;
  samwellDimmed: boolean;
  onTranscript: () => void;
  onAskSamwell: () => void;
};

/**
 * Two equal boxes side by side: the transcript, and Samwell on this episode.
 * Compact, with gold icons, under the player's options row and in the
 * episode page's hero. What each says comes from `transcriptButtons`.
 */
export function TranscriptButtons({ transcriptLabel, progress, samwellLabel, samwellDimmed, onTranscript, onAskSamwell }: TranscriptButtonsProps) {
  const tokens = useThemeTokens();
  const gold = tokens['--color-primary'];
  const fill = useSharedValue(progress ?? 0);
  React.useEffect(() => fill.set(progress ?? 0), [fill, progress]);
  const samwellColor = samwellDimmed ? tokens['--color-muted-foreground'] : tokens['--color-foreground'];

  return (
    <View className="flex-row gap-2">
      <Touchable
        className="min-h-10 flex-1 flex-row items-center justify-center gap-2 border border-border bg-card px-3 shadow-sm"
        onPress={onTranscript}
        haptic="select"
        accessibilityRole="button"
        accessibilityLabel={transcriptLabel}
      >
        {progress != null ? <ProgressOutline progress={fill} /> : null}
        <ScrollText size={16} color={gold} />
        <ThemedText type="labelSm" style={{ fontVariant: ['tabular-nums'] }} numberOfLines={1}>
          {transcriptLabel}
        </ThemedText>
      </Touchable>
      <Touchable
        className="min-h-10 flex-1 flex-row items-center justify-center gap-2 border border-border bg-card px-3 shadow-sm"
        style={samwellDimmed ? { opacity: 0.6 } : undefined}
        onPress={onAskSamwell}
        disabled={samwellDimmed}
        haptic="select"
        accessibilityRole="button"
        accessibilityLabel={samwellLabel}
        accessibilityState={{ disabled: samwellDimmed }}
      >
        <ZodiacPisces size={16} color={samwellDimmed ? samwellColor : gold} />
        <ThemedText type="labelSm" color={samwellColor} numberOfLines={1}>
          {samwellLabel}
        </ThemedText>
      </Touchable>
    </View>
  );
}
