import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { ChevronUp, MessageCircleHeart } from 'lucide-react-native';

import { SettingsSection } from '@/features/settings/components/settings-section';
import { CreatorNoteSheet } from '@/components/settings/creator-note-sheet';
import { ThemedText } from '@/components/themed-text';
import { PrefixIcon } from '@/components/ui/prefix-icon';
import { Touchable } from '@/components/ui/touchable';
import { elevation } from '@/constants/theme';
import { asColor } from '@/utils/colors';

/** The note from the creator, in sheet form. */
export function ReachOutSection() {
  const [mutedForeground] = useCSSVariable(['--color-muted-foreground']);
  const [noteOpen, setNoteOpen] = React.useState(false);

  return (
    <SettingsSection label="REACH OUT">
      <Touchable
        className="flex-row items-center justify-between bg-card p-4"
        style={elevation.soft}
        onPress={() => setNoteOpen(true)}
      >
        {/* A long title with a bare chevron (no value text) has nowhere to give:
            forcing extra `gap` here overflowed the row and ate its own right
            padding instead. flexShrink lets the title wrap to a second line under
            real width pressure, so the chevron always keeps the row's normal
            right-edge padding, same as every other row. */}
        <View className="flex-row items-center gap-3 shrink">
          <PrefixIcon icon={MessageCircleHeart} size={36} />
          <ThemedText type="bodyMd" className="shrink">
            Note from Thamsanqa Dreem
          </ThemedText>
        </View>
        <ChevronUp size={14} color={asColor(mutedForeground)} />
      </Touchable>

      <CreatorNoteSheet visible={noteOpen} onClose={() => setNoteOpen(false)} />
    </SettingsSection>
  );
}
