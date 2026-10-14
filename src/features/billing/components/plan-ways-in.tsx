import React from 'react';
import { View } from 'react-native';

import { LogIn, RefreshCw, Ticket } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { ManagementRow } from '@/features/billing/components/management-row';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

export type PlanWaysInProps = {
  /** Check the store account for a plan bought before. */
  onRestore?: () => void;
  /** The restore is running: its row shows the wait where its chevron was. */
  restoring?: boolean;
  /** Something is being bought or restored, so nothing here takes a press. */
  disabled?: boolean;
  /** Left out for somebody already signed in, who has no use for it. */
  onAccount?: () => void;
  onInsiderCode?: () => void;
};

/**
 * The ways into a plan that are not buying one, under the plans: a purchase
 * made before, an account that already holds one, a code somebody was given.
 *
 * A list, under its own heading. These were three lines of small capitals
 * centred one under another, which gave them no edge to line up on, nothing
 * to say they belonged together and nothing to say they could be pressed.
 * Apple asks a subscription screen for "a way for current subscribers to
 * sign in or restore purchases", which is one need, so they are drawn as one
 * group: the same row the plan's own management sheet is built from, each
 * with its mark, what it is for, and a chevron.
 *
 * Still quiet. No gold and no card: the plans above are what this part of
 * the screen is selling, and these are for the few who are not buying.
 */
export function PlanWaysIn({ onRestore, restoring = false, disabled = false, onAccount, onInsiderCode }: PlanWaysInProps) {
  const muted = useThemeTokens()['--color-muted-foreground'];
  if (!onRestore && !onAccount && !onInsiderCode) return null;

  return (
    <View className="gap-2">
      <ThemedText type="labelSm" color={muted}>
        ALREADY HAVE A PLAN?
      </ThemedText>
      {/* The rows each draw the line above them; this one closes the list. */}
      <View className="border-b border-border">
        {onRestore ? (
          <ManagementRow
            icon={RefreshCw}
            label="Restore purchases"
            detail="Find a plan bought with this store account"
            busy={restoring}
            disabled={disabled}
            onPress={onRestore}
          />
        ) : null}
        {onAccount ? (
          <ManagementRow
            icon={LogIn}
            label="Sign in"
            detail="Use the plan on your account"
            busy={false}
            disabled={disabled}
            onPress={onAccount}
          />
        ) : null}
        {onInsiderCode ? (
          <ManagementRow
            icon={Ticket}
            label="Insider code"
            detail="Redeem a code you were given"
            busy={false}
            disabled={disabled}
            onPress={onInsiderCode}
          />
        ) : null}
      </View>
    </View>
  );
}
