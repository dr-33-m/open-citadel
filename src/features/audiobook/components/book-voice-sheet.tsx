import React from 'react';
import { View } from 'react-native';

import { PageFade } from '@/components/scroll-fades';
import { ThemedText } from '@/components/themed-text';
import { Sheet } from '@/components/ui/sheet';
import { PlansSheet } from '@/features/billing/components/plans-sheet';
import type { BookVoiceState } from '@/features/audiobook/hooks/use-book-voice';
import { CloudVoicePane } from '@/features/tts/components/cloud-voice-pane';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

/**
 * Who reads the book: the voice boxes, their versions and narrators, exactly
 * as the reader chooses them (`CloudVoicePane`). The title and its line are
 * pinned; the pane scrolls under them.
 */
export function BookVoiceSheet({ state }: { state: BookVoiceState }) {
  const muted = useThemeTokens()['--color-muted-foreground'];
  return (
    <>
      <Sheet {...state.sheet} snapRatios={[0.78]} scrollable>
        <View className="gap-1 px-6 pb-3">
          <ThemedText type="headlineSm">Voice</ThemedText>
          <ThemedText type="bodySm" color={muted}>
            Books are heard in this voice, and read aloud in it too.
          </ThemedText>
        </View>
        <View className="flex-1 overflow-hidden">
          <Sheet.Deferred skeleton={null}>
            <PageFade edges="both" surface="popover">
              <Sheet.ScrollView contentContainerClassName="px-6 pb-6 pt-2">
                <CloudVoicePane {...state.voices} />
              </Sheet.ScrollView>
            </PageFade>
          </Sheet.Deferred>
        </View>
      </Sheet>
      <PlansSheet nested {...state.plans} />
    </>
  );
}
