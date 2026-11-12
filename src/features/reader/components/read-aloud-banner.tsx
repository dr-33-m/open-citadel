import React from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type ReadAloudBannerProps = {
  /** Back to where the voice is: gold, first. */
  backLabel: string;
  onBack: () => void;
  /** The voice to the page on screen. */
  hereLabel: string;
  onHere: () => void;
  bottom: number;
};

/**
 * The reader's page has moved away from the voice: back to the voice, or the
 * voice to the page. For read-aloud paused and then left behind, and for a
 * book heard in the player whose pages were turned by hand.
 */
export function ReadAloudBanner({ backLabel, onBack, hereLabel, onHere, bottom }: ReadAloudBannerProps) {
  const tokens = useThemeTokens();
  return (
    <View className="absolute left-6 right-6 flex-row items-center border border-surface-tertiary bg-card px-4 py-3" style={{ bottom }}>
      <Touchable className="flex-1" onPress={onBack}>
        <ThemedText type="labelSm" color={tokens['--color-primary']}>
          {backLabel}
        </ThemedText>
      </Touchable>
      <Touchable className="flex-1" onPress={onHere}>
        <ThemedText type="labelSm" color={tokens['--color-muted-foreground']}>
          {hereLabel}
        </ThemedText>
      </Touchable>
    </View>
  );
}
