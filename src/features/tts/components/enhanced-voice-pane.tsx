import React from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AiVoiceSection, type AiVoiceSectionProps } from '@/features/tts/components/ai-voice-section';
import { ReadingSpeedStepper } from '@/features/tts/components/reading-speed-stepper';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

export interface EnhancedVoicePaneProps {
  /** What Enhanced voices are, in one line. Left out where there is no switch to explain. */
  hint: string | null;
  /** How this phone copes with the chosen voice box, under that box's line. */
  mark: React.ReactNode;
  section: Omit<AiVoiceSectionProps, 'mark'>;
  /** The chosen voice box has its voices, so there is a speed to set. */
  showSpeed: boolean;
  /** The speeds the chosen voice box can read at, or undefined for the full range. */
  rates: readonly number[] | undefined;
}

/** Everything that belongs to the Enhanced voices: their line, the voice box, the voice, and its speed. */
export function EnhancedVoicePane({ hint, mark, section, showSpeed, rates }: EnhancedVoicePaneProps) {
  const muted = useThemeTokens()['--color-muted-foreground'];
  return (
    <View className="gap-4">
      {hint ? (
        <ThemedText type="bodySm" color={muted}>
          {hint}
        </ThemedText>
      ) : null}
      <AiVoiceSection {...section} mark={mark} />
      {showSpeed ? <ReadingSpeedStepper rates={rates} /> : null}
    </View>
  );
}
