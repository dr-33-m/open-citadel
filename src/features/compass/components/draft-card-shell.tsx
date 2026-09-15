import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { GoldButton } from '@/components/ui/gold-button';
import { Touchable } from '@/components/ui/touchable';
import { asColor } from '@/utils/colors';

type DraftCardShellProps = {
  /** The gold uppercase eyebrow: GOAL, ADJUSTMENT. */
  label: string;
  approveLabel: string;
  onApprove: () => void;
  /**
   * Work on it more.
   *
   * This does NOT dismiss the card, and that is the point. The old REFINE
   * button was wired to a no-op and never worked; the fix is not to make it
   * hide the draft but to put the cursor in the composer with the proposal
   * still on screen, so the reader can see what they are arguing with while
   * they say what is wrong with it.
   */
  onRefine: () => void;
  disabled?: boolean;
  children: React.ReactNode;
};

/**
 * The card a proposal arrives in, at the end of the transcript.
 *
 * The house `Card`, given a gold left edge. The edge is the one departure and
 * it earns itself: this is part of the conversation, one step forward from it
 * rather than a dialog interrupting it, and the accent says which of the
 * things in the transcript is asking for an answer.
 */
export function DraftCardShell({
  label,
  approveLabel,
  onApprove,
  onRefine,
  disabled = false,
  children,
}: DraftCardShellProps) {
  const [primary, mutedForeground] = useCSSVariable([
    '--color-primary',
    '--color-muted-foreground',
  ]);

  return (
    <Card className="border-l-2 border-l-primary">
      <Card.Content className="gap-3 p-4">
        <ThemedText type="labelSm" color={asColor(primary)}>
          {label}
        </ThemedText>
        <View className="gap-3">{children}</View>
        <View className="mt-1 gap-2">
          <GoldButton label={approveLabel} onPress={disabled ? undefined : onApprove} />
          <Touchable
            className="items-center border border-border py-3"
            onPress={disabled ? undefined : onRefine}
            accessibilityRole="button"
            accessibilityLabel="Work on it more"
          >
            <ThemedText type="labelMd" color={asColor(mutedForeground)}>
              WORK ON IT MORE
            </ThemedText>
          </Touchable>
        </View>
      </Card.Content>
    </Card>
  );
}
