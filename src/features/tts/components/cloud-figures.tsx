import React from 'react';
import { View, type TextStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { CloudFigure } from '@/features/tts/utils/cloud-voice-cards';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { cn } from '@/lib/cn';

const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

export interface CloudFiguresProps {
  /** What the voice costs. Empty for a voice with no price, and then nothing is drawn. */
  figures: CloudFigure[];
  /** Whose plan the figures are on: the reader's, or one being sampled ("ON GRAND MAESTER"). */
  label?: string;
}

/**
 * What a voice costs, as figures: a month in hours and a chapter in Neurons,
 * each number in the serif with its unit beside it. Drawn in the sheet a
 * version's "i" opens.
 *
 * Flat and set in, not lifted like a card: it is read, not pressed. One
 * panel with a rule down the middle, because the two numbers are one fact
 * about one voice.
 */
export function CloudFigures({ figures, label = 'ON YOUR PLAN' }: CloudFiguresProps) {
  const muted = useThemeTokens()['--color-muted-foreground'];
  if (figures.length === 0) return null;

  return (
    <View className="gap-2">
      <ThemedText type="labelSm" color={muted}>
        {label}
      </ThemedText>
      <View className="flex-row border border-border bg-muted">
        {figures.map((figure, at) => (
          <View key={figure.key} className={cn('flex-1 gap-1 p-3', at > 0 && 'border-l border-border')}>
            <View className="flex-row flex-wrap items-baseline gap-x-1.5">
              <ThemedText type="headlineMd" style={TABULAR}>
                {figure.value}
              </ThemedText>
              <ThemedText type="bodySm" color={muted}>
                {figure.unit}
              </ThemedText>
            </View>
            <ThemedText type="labelSm" color={muted}>
              {figure.label}
            </ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}
