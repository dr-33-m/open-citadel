import React from 'react';
import { View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import { ScrollText, ZodiacPisces } from '@/components/icons';
import { ProgressOutline } from '@/components/progress-outline';
import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { iconSize } from '@/constants/theme';
import { PlayerTool } from '@/features/podcasts/components/player-tool';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

export type TranscriptButtonsProps = {
  transcriptLabel: string;
  /** 0 to 1 while a job runs, drawn as the square outline filling in; null otherwise. */
  progress: number | null;
  samwellLabel: string;
  samwellDimmed: boolean;
  onTranscript: () => void;
  onAskSamwell: () => void;
  /** In the player's row of tools: the two as bare icons, the words left to the screen reader. */
  tools?: boolean;
};

/**
 * The transcript, and Samwell on this episode. In the episode page's hero,
 * two equal boxes side by side, compact, with gold icons; in the player's
 * row of tools, two bare icons in the muted ink like the rest of the row,
 * the transcript's gold square filling in round it while one is made. What
 * each says comes from `transcriptButtons`.
 */
export function TranscriptButtons({ transcriptLabel, progress, samwellLabel, samwellDimmed, onTranscript, onAskSamwell, tools = false }: TranscriptButtonsProps) {
  const tokens = useThemeTokens();
  const gold = tokens['--color-primary'];
  const fill = useSharedValue(progress ?? 0);
  React.useEffect(() => fill.set(progress ?? 0), [fill, progress]);
  const samwellColor = samwellDimmed ? tokens['--color-muted-foreground'] : tokens['--color-foreground'];

  if (tools) {
    const muted = tokens['--color-muted-foreground'];
    return (
      <>
        <PlayerTool label={transcriptLabel} onPress={onTranscript}>
          <View className="h-8 w-8 items-center justify-center">
            {progress != null ? <ProgressOutline progress={fill} /> : null}
            <ScrollText size={iconSize.default} color={muted} />
          </View>
        </PlayerTool>
        <PlayerTool label={samwellLabel} onPress={onAskSamwell} disabled={samwellDimmed}>
          <ZodiacPisces size={iconSize.default} color={muted} />
        </PlayerTool>
      </>
    );
  }

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
