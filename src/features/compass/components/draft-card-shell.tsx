import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ActionButton } from '@/components/action-button';
import { Check } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { GoldButton } from '@/components/ui/gold-button';
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
  /**
   * The status line of a card already approved ("GOAL STARTED"). It takes the
   * buttons' place and the gold edge goes quiet: nothing here asks for an
   * answer any more.
   */
  done?: string | null;
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
  done = null,
  children,
}: DraftCardShellProps) {
  const [primary, mutedForeground] = useCSSVariable([
    '--color-primary',
    '--color-muted-foreground',
  ]);
  const muted = asColor(mutedForeground);
  const edge = done ? 'border-l-2 border-l-border' : 'border-l-2 border-l-primary';

  return (
    <Card className={edge}>
      <Card.Content className="gap-3 p-4">
        <ThemedText type="labelSm" color={done ? muted : asColor(primary)}>
          {label}
        </ThemedText>
        <View className="gap-3">{children}</View>
        {/* Approved, a status line takes the buttons' place. Waiting, two
            answers of equal standing, so they are the same 40pt box and the
            fill alone marks the one that accepts. The 56pt bar is for a
            button that is its screen's whole purpose, and in a card among
            messages it out-shouted the proposal it sat under. */}
        {done ? (
          <View className="mt-1 flex-row items-center gap-2">
            <Check size={16} color={muted} />
            <ThemedText type="labelSm" color={muted}>
              {done}
            </ThemedText>
          </View>
        ) : (
          <View className="mt-1 gap-2">
            <GoldButton label={approveLabel} size="compact" onPress={disabled ? undefined : onApprove} />
            <ActionButton
              label="WORK ON IT MORE"
              onPress={disabled ? undefined : onRefine}
              tint={muted}
              centered
              className="h-10"
            />
          </View>
        )}
      </Card.Content>
    </Card>
  );
}
