import React from 'react';
import { useCSSVariable } from 'uniwind';
import { BookOpen } from 'lucide-react-native';

import { SettingsSection } from '@/features/settings/components/settings-section';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { PrefixIcon } from '@/components/ui/prefix-icon';
import { asColor } from '@/utils/colors';

/** Static: why EPUB-only. No state, never re-renders for anything. */
export const BooksTipSection = React.memo(function BooksTipSection() {
  const [mutedForeground] = useCSSVariable(['--color-muted-foreground']);

  return (
    <SettingsSection label="BOOKS">
      <Card className="flex-row items-center gap-3 p-4">
        <PrefixIcon icon={BookOpen} size={36} />
        <ThemedText type="bodySm" color={asColor(mutedForeground)} className="flex-1">
          Open Citadel is EPUB-only. EPUB is the best format for knowledge capture. It supports
          themes, custom fonts, and text-to-speech.
        </ThemedText>
      </Card>
    </SettingsSection>
  );
});
