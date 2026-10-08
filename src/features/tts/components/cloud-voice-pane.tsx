import React from 'react';
import { View } from 'react-native';

import { ChoiceChips, type Choice } from '@/components/choice-chips';
import { ThemedText } from '@/components/themed-text';
import { CloudVoicePicker } from '@/features/tts/components/cloud-voice-picker';
import { ReadingSpeedStepper } from '@/features/tts/components/reading-speed-stepper';
import type { CloudSelection } from '@/features/tts/utils/cloud-voices';
import { CLOUD_PRIVACY, CLOUD_SAMPLES_FREE, CLOUD_SPEED_FIXED } from '@/features/tts/utils/voice-copy';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

export interface CloudVoicePaneProps {
  selection: CloudSelection | null;
  /** Every maker, the ones out of reach locked with their plan's name. */
  makers: Choice<string>[];
  /** The chosen maker's models, when it has more than one. */
  models: Choice<string>[];
  costs: { chapter: string | null; hours: string | null };
  onMaker: (maker: string) => void;
  onModel: (modelId: string) => void;
  onVoice: (voice: string) => void;
}

/**
 * Everything that belongs to the cloud voices, built from the same pieces as
 * the on-device panes: the maker as chips (the ENGINE chips' kind), the
 * model where a maker has two, the voice row with its samples, what it costs
 * as figures rather than prices, reading speed where the maker takes it, and
 * one line of trust.
 */
export function CloudVoicePane({ selection, makers, models, costs, onMaker, onModel, onVoice }: CloudVoicePaneProps) {
  const muted = useThemeTokens()['--color-muted-foreground'];
  if (!selection) return null;
  const figures = [costs.chapter, costs.hours].filter((line): line is string => line !== null);

  return (
    <View className="gap-4">
      <ThemedText type="bodySm" color={muted}>
        {selection.model.description}
      </ThemedText>
      <ChoiceChips label="VOICE MAKER" choices={makers} value={selection.model.maker} onChange={onMaker} gutter="none" fill />
      {models.length > 0 ? (
        <ChoiceChips choices={models} value={selection.model.id} onChange={onModel} gutter="none" fill />
      ) : null}
      <View className="gap-2">
        <CloudVoicePicker
          modelId={selection.model.id}
          voices={selection.model.voices}
          selected={selection.voice}
          onPick={onVoice}
        />
        <ThemedText type="bodySm" color={muted}>
          {CLOUD_SAMPLES_FREE}
        </ThemedText>
      </View>
      {figures.length > 0 ? (
        <View className="gap-0.5">
          {figures.map((line) => (
            <ThemedText key={line} type="bodyMd">
              {line}
            </ThemedText>
          ))}
        </View>
      ) : null}
      {selection.model.speedSupported ? (
        <ReadingSpeedStepper />
      ) : (
        <ThemedText type="bodySm" color={muted}>
          {CLOUD_SPEED_FIXED}
        </ThemedText>
      )}
      <ThemedText type="bodySm" color={muted}>
        {CLOUD_PRIVACY}
      </ThemedText>
    </View>
  );
}
