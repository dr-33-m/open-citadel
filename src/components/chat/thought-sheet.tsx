import React from 'react';
import { View } from 'react-native';

import { ThoughtTrace } from '@/components/chat/thought-trace';
import { FitSheet } from '@/components/fit-sheet';
import { ThemedText } from '@/components/themed-text';
import { thoughtForLabel } from '@/components/ui/reasoning';
import { spacing } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { TurnThought } from '@/utils/turn-activity';

export interface ThoughtSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Kept by the caller while the sheet slides away, so it does not empty as it goes. */
  thought: TurnThought | null;
}

const CONTENT = { paddingHorizontal: spacing[6], paddingTop: spacing[2], paddingBottom: spacing[4] };

/**
 * What Samwell worked through before a reply, in full: raised from the brain
 * in the reply's footer (`ThoughtButton`). The title says how long, pinned
 * while the trace (`ThoughtTrace`), from where he started to where he
 * finished, scrolls under it when it is long. One per conversation.
 */
export function ThoughtSheet({ visible, onClose, thought }: ThoughtSheetProps) {
  const muted = useThemeTokens()['--color-muted-foreground'];
  const header = (
    <View className="gap-1 px-6 pb-3">
      <ThemedText type="headlineSm">{thoughtForLabel(thought?.seconds ?? undefined)}</ThemedText>
      <ThemedText type="bodySm" color={muted}>
        What Samwell worked through before he answered.
      </ThemedText>
    </View>
  );

  return (
    <FitSheet visible={visible} onClose={onClose} header={header} contentStyle={CONTENT}>
      <ThoughtTrace text={thought?.text ?? ''} />
    </FitSheet>
  );
}
