import React from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Sheet } from '@/components/ui/sheet';
import { ChoiceChips } from '@/components/choice-chips';
import { SLEEP_CHOICES, type Choice, type SleepChoice } from '@/features/podcasts/utils/setting-choices';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type SleepSheetProps = {
  visible: boolean;
  current: SleepChoice;
  /** An episode's, ending at its end; a book's, at the end of the chapter. */
  choices?: Choice<SleepChoice>[];
  onClose: () => void;
  onChange: (choice: SleepChoice) => void;
};

/** Stop playing after a while. The last ten seconds fade out rather than cut off. */
export function SleepSheet({ visible, current, choices = SLEEP_CHOICES, onClose, onChange }: SleepSheetProps) {
  const tokens = useThemeTokens();
  return (
    <Sheet visible={visible} onClose={onClose}>
      <View className="gap-4 pb-2">
        <View className="gap-1 px-4">
          <ThemedText type="headlineSm">Sleep timer</ThemedText>
          <ThemedText type="bodySm" color={tokens['--color-muted-foreground']}>
            Playback fades out and pauses, and your place is kept.
          </ThemedText>
        </View>
        <ChoiceChips
          choices={choices}
          value={current}
          onChange={(choice) => {
            onChange(choice);
            onClose();
          }}
        />
      </View>
    </Sheet>
  );
}
