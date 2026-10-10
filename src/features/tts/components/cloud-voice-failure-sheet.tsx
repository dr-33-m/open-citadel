import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ActionButton } from '@/components/action-button';
import { CircleAlert } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { GoldButton } from '@/components/ui/gold-button';
import { Sheet } from '@/components/ui/sheet';
import type { FailureAction, FailureCopy } from '@/features/tts/utils/cloud-failure';
import { asColor } from '@/utils/colors';

export interface CloudVoiceFailureSheetProps {
  visible: boolean;
  /** What happened and the ways out (`cloudFailureCopy`). Kept while the sheet slides away. */
  copy: FailureCopy | null;
  onAction: (action: FailureAction) => void;
  /** Dragged away without a choice: reading stops, and play starts it again. */
  onClose: () => void;
}

/**
 * A cloud voice that cannot go on, said plainly over the page.
 *
 * Rises when the book has paused at the sentence the voice could not read,
 * and offers exactly the ways out the state has: carry on with the phone's
 * voice at that sentence, try again, or get the plan that would let it go on.
 * The same two equal boxes as `EnhancedFitSheet`; the filled one is the way
 * most readers will want.
 */
export function CloudVoiceFailureSheet({ visible, copy, onAction, onClose }: CloudVoiceFailureSheetProps) {
  const [mutedForeground, warning, primary] = useCSSVariable([
    '--color-muted-foreground',
    '--color-warning-foreground',
    '--color-primary',
  ]);
  const secondary = copy?.secondary ?? null;

  return (
    <Sheet visible={visible} onClose={onClose}>
      {copy ? (
        <View className="gap-6 px-6">
          <View className="gap-3">
            <View className="flex-row items-start gap-2">
              <CircleAlert size={20} color={asColor(warning)} strokeWidth={2} />
              {/* The row's whole width, for the same reason as the fit sheet:
                  Android measures the serif short and drops the last word. */}
              <ThemedText type="headlineSm" className="flex-1">
                {copy.title}
              </ThemedText>
            </View>
            <ThemedText type="bodyMd" color={asColor(mutedForeground)}>
              {copy.line}
            </ThemedText>
          </View>

          <View className="flex-row gap-3">
            {secondary ? (
              <ActionButton
                label={secondary.label}
                onPress={() => onAction(secondary.action)}
                tint={asColor(primary)}
                centered
                className="h-10 flex-1"
              />
            ) : null}
            <View className="flex-1">
              <GoldButton label={copy.primary.label} size="compact" onPress={() => onAction(copy.primary.action)} />
            </View>
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}
