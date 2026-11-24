import React from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Spinner } from '@/components/ui/spinner';
import { revealIn } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

/**
 * The transcript while it is matched to the copy of the episode being heard
 * (`time-map.ts`): a loader and why, in place of lines that would not yet
 * follow the voice. Shown for at most a short wait (`useSyncWait`), and only
 * the first time a copy is heard: a copy matched once is never matched again.
 */
export function TranscriptSyncing() {
  const tokens = useThemeTokens();
  const muted = tokens['--color-muted-foreground'];
  return (
    <View className="items-center gap-4 px-6 pt-16" accessibilityLabel="Syncing the transcript to this episode" accessible>
      <Spinner />
      <Animated.View entering={revealIn(1)} className="items-center gap-2">
        <ThemedText type="labelSm" color={muted}>
          SYNCING
        </ThemedText>
        <ThemedText type="bodySm" color={muted} className="text-center">
          Lining the transcript up with the ads in the copy you are hearing.
        </ThemedText>
      </Animated.View>
    </View>
  );
}
