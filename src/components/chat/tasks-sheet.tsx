import React from 'react';
import { View } from 'react-native';

import { TurnTrail } from '@/components/chat/turn-trail';
import { FitSheet } from '@/components/fit-sheet';
import { ThemedText } from '@/components/themed-text';
import { spacing } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { TurnStep } from '@/utils/turn-activity';

export interface TasksSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Kept by the caller while the sheet slides away, so it does not empty as it goes. */
  steps: readonly TurnStep[];
}

const CONTENT = { paddingHorizontal: spacing[6], paddingBottom: spacing[4] };

/**
 * Everything Samwell did on the way to a reply, a step to a row, each closed
 * on what came of it until opened: raised from the ticked list in the reply's
 * footer (`TasksButton`). The title is pinned while a long list scrolls under
 * it. One per conversation.
 */
export function TasksSheet({ visible, onClose, steps }: TasksSheetProps) {
  const muted = useThemeTokens()['--color-muted-foreground'];
  const line = steps.length === 1 ? 'One step on the way to his answer' : `${steps.length} steps on the way to his answer`;
  const header = (
    <View className="gap-1 px-6 pb-3">
      <ThemedText type="headlineSm">What Samwell did</ThemedText>
      <ThemedText type="bodySm" color={muted}>
        {line}
      </ThemedText>
    </View>
  );

  return (
    <FitSheet visible={visible} onClose={onClose} header={header} contentStyle={CONTENT}>
      <TurnTrail steps={steps} />
    </FitSheet>
  );
}
