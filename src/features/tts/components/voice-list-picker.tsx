import React from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { VoiceListSheet, type VoiceListSheetProps } from '@/features/tts/components/voice-list-sheet';
import { VoicePickerRow } from '@/features/tts/components/voice-picker-row';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

export interface VoiceListPickerProps extends VoiceListSheetProps {
  /** The voice in use, as the row names it. */
  name: string;
  /** What the row does, for a screen reader: "Choose a Lite voice". */
  accessibilityLabel: string;
  /** What the row calls the choice: "Voice" unless given ("Narrator"). */
  label?: string;
  onOpen: () => void;
}

/**
 * Choosing a voice, for every kind of voice: a row naming the one in use
 * that opens the list of the others, each with a sample to play.
 *
 * The one picker. The phone's own voices, the Enhanced ones and each cloud
 * voice box's all draw this and differ only in what they hand it
 * (`NativeVoicePicker`, `EnhancedVoicePicker`, `CloudVoicePicker` are the
 * wiring; `useVoiceListPicker` is what they share). A fourth kind of voice
 * is a fourth piece of wiring, never a second list.
 *
 * Something a sample has to say for itself (still loading, failed) shows in
 * the list while it is open, and under the row once it is closed.
 */
export function VoiceListPicker({ name, accessibilityLabel, label, onOpen, ...sheet }: VoiceListPickerProps) {
  const muted = useThemeTokens()['--color-muted-foreground'];

  return (
    <View className="gap-2">
      <VoicePickerRow name={name} onPress={onOpen} accessibilityLabel={accessibilityLabel} label={label} />
      <VoiceListSheet {...sheet} />
      {sheet.note && !sheet.visible ? (
        <ThemedText type="bodySm" color={muted}>
          {sheet.note}
        </ThemedText>
      ) : null}
    </View>
  );
}
