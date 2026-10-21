import React from 'react';
import { View } from 'react-native';

import { CloudCog, RotateCcw } from '@/components/icons';
import { StageGlyph } from '@/components/stage/stage-glyph';
import { ThemedText } from '@/components/themed-text';
import { GoldButton } from '@/components/ui/gold-button';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

/**
 * The voices could not be read from Samwell Cloud, so there is nothing to
 * choose from: said plainly, with the way back. Never a blank sheet.
 */
export function VoicesUnavailable({ onRetry }: { onRetry: () => void }) {
  const muted = useThemeTokens()['--color-muted-foreground'];
  return (
    <View className="items-center gap-6 py-10">
      <StageGlyph icon={CloudCog} color={muted} />
      <View className="items-center gap-2">
        <ThemedText type="headlineSm" className="text-center">
          The voices are not here yet
        </ThemedText>
        <ThemedText type="bodyMd" color={muted} className="text-center">
          They come from Samwell Cloud, which did not answer.
        </ThemedText>
      </View>
      <GoldButton label="TRY AGAIN" icon={RotateCcw} onPress={onRetry} />
    </View>
  );
}
