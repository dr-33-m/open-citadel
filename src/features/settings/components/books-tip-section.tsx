import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { BookOpen } from 'lucide-react-native';

import { SettingsSection } from '@/features/settings/components/settings-section';
import { ThemedText } from '@/components/themed-text';
import { PrefixIcon } from '@/components/ui/prefix-icon';
import { elevation } from '@/constants/theme';
import { asColor } from '@/utils/colors';

/** Static: why EPUB-only. No state, never re-renders for anything. */
export const BooksTipSection = React.memo(function BooksTipSection() {
  const [mutedForeground] = useCSSVariable(['--color-muted-foreground']);

  return (
    <SettingsSection index={2} label="BOOKS">
      <View className="flex-row items-center gap-3 bg-card p-4" style={elevation.soft}>
        <PrefixIcon icon={BookOpen} size={36} />
        <ThemedText type="bodySm" color={asColor(mutedForeground)} className="flex-1">
          Open Citadel is EPUB-only. EPUB is the best format for knowledge capture. It supports
          themes, custom fonts, and text-to-speech.
        </ThemedText>
      </View>
    </SettingsSection>
  );
});
