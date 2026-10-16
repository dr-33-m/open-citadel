import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { AudioLines, ChevronUp } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { PrefixIcon } from '@/components/ui/prefix-icon';
import { Touchable } from '@/components/ui/touchable';
import { asColor } from '@/utils/colors';

export interface VoicePickerRowProps {
  /** The voice in use, by name. */
  name: string;
  onPress: () => void;
  /** What a screen reader says the row does, e.g. "Choose a Lite voice". */
  accessibilityLabel: string;
  /** What the row is, on its left. "Voice" unless the kind of voice has a name of its own ("Narrator"). */
  label?: string;
}

/**
 * The row that names the voice in use and opens the list of the others. Lite
 * and Enhanced voices are both chosen this way, so the two kinds differ in
 * what they sound like and not in how they are picked.
 */
export function VoicePickerRow({ name, onPress, accessibilityLabel, label = 'Voice' }: VoicePickerRowProps) {
  const [mutedForeground, primary] = useCSSVariable(['--color-muted-foreground', '--color-primary']);
  return (
    // A tap is felt: the row opens something, and a press with no answer
    // under the finger reads as missed until the sheet has started to rise.
    <Touchable onPress={onPress} haptic="tap" accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
      <Card className="flex-row items-center justify-between p-3">
        <View className="flex-row items-center gap-3">
          {/* Gold, as every icon box that leads a row is (Settings, the voice boxes). */}
          <PrefixIcon icon={AudioLines} size={28} color={asColor(primary)} />
          <ThemedText type="bodyMd">{label}</ThemedText>
        </View>
        <View className="flex-row items-center gap-1">
          <ThemedText type="bodySm" color={asColor(mutedForeground)}>
            {name}
          </ThemedText>
          <ChevronUp size={14} color={asColor(mutedForeground)} />
        </View>
      </Card>
    </Touchable>
  );
}
