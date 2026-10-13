import React from 'react';
import { Pressable, View } from 'react-native';

import { Volume2 } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Spinner } from '@/components/ui/spinner';
import { Touchable } from '@/components/ui/touchable';
import type { DeviceVoice } from '@/utils/device-voices';

export interface VoiceListItemProps {
  voice: DeviceVoice;
  isSelected: boolean;
  isPreviewing: boolean;
  /** The sample was asked for and cannot be heard yet: the speaker gives way to a spinner. */
  isPreparing?: boolean;
  primary?: string;
  mutedForeground?: string;
  onSelect: (voice: DeviceVoice) => void;
  onPreview: (voice: DeviceVoice) => void;
}

/**
 * One phone voice in the picker's list, memoized on primitives: a selection or
 * preview flip re-renders the affected rows, not every voice in the list.
 */
const pressedDim = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.6 } : null);
const ICON_BOX = { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' } as const;

export const VoiceListItem = React.memo(function VoiceListItem({
  voice,
  isSelected,
  isPreviewing,
  isPreparing = false,
  primary,
  mutedForeground,
  onSelect,
  onPreview,
}: VoiceListItemProps) {
  return (
    <Touchable
      className="flex-row items-center gap-4 border-b border-card px-6 py-4"
      onPress={() => onSelect(voice)}
      // Choosing a voice is a selection, and is felt as one.
      haptic="select"
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected }}
    >
      <View className="flex-1 gap-1">
        <ThemedText type="bodyMd">{voice.name}</ThemedText>
        {voice.language ? (
          <ThemedText type="labelSm" color={mutedForeground}>
            {voice.language}
          </ThemedText>
        ) : null}
      </View>
      {voice.quality ? (
        <View className="bg-muted px-2 py-[2px]">
          <ThemedText type="labelSm" color={mutedForeground}>
            {voice.quality}
          </ThemedText>
        </View>
      ) : null}
      {voice.identifier ? (
        // A plain `Pressable`, not a `Touchable`: there is one of these on
        // every row of a long list, and a second animated press on each was
        // a measurable part of what the list cost to mount.
        <Pressable
          onPress={(event) => {
            event.stopPropagation();
            onPreview(voice);
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={isPreparing ? `Preparing ${voice.name}. Stop` : `Preview ${voice.name}`}
          accessibilityState={{ busy: isPreparing }}
          style={pressedDim}
        >
          {/* The speaker's own box either way, so the row does not shift
              when one gives way to the other. */}
          <View style={ICON_BOX}>
            {isPreparing ? <Spinner size="sm" /> : <Volume2 size={18} color={isPreviewing ? primary : mutedForeground} />}
          </View>
        </Pressable>
      ) : null}
      {isSelected && (
        <ThemedText type="bodyMd" color={primary}>
          ✓
        </ThemedText>
      )}
    </Touchable>
  );
});
