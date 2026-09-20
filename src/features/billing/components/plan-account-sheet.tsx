import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { AccountEntryButtons } from '@/components/account/account-entry-buttons';
import { SamwellText } from '@/components/samwell-text';
import { ThemedText } from '@/components/themed-text';
import { Sheet } from '@/components/ui/sheet';
import { useAccountErrorToast } from '@/hooks/use-account-error-toast';
import { asColor } from '@/utils/colors';

/**
 * The account, asked for at the moment a plan is chosen.
 *
 * The plans themselves are readable without one, which is the whole point of
 * the signed-out carousel: App Review reads a price list behind a sign-in
 * wall as registration required in order to buy. What an account is actually
 * for is said here instead, once somebody has decided to buy something, and
 * it is said as a reason rather than as a rule.
 *
 * The reason is true and worth giving: a plan is a monthly balance of credits
 * spent on models that run on our servers, so there is no version of it that
 * lives on a phone. The account is the thing the credits belong to.
 *
 * The buttons are the same two every other door uses, from the same file, so
 * signing in here cannot behave differently from signing in anywhere else.
 * Its sibling is `ConciergeSignInSheet`, which asks at the other moment worth
 * asking at: they have the same shape and deliberately different copy.
 */
export function PlanAccountSheet({
  visible,
  kind,
  planLabel,
  onClose,
  onSignedIn,
}: {
  visible: boolean;
  /** Buying asks for somewhere to put a new plan; restoring asks for the
   *  account that already holds one. */
  kind: 'buy' | 'restore';
  /**
   * The plan they just chose, by name: "Maester Samwell", "Grand Maester
   * Samwell", "Archmaester Samwell". The sheet used to name the middle one
   * whatever had been tapped, which told somebody buying the Archmaester
   * that they were buying something else. Null when restoring, where no plan
   * has been picked.
   */
  planLabel: string | null;
  onClose: () => void;
  onSignedIn: () => void;
}) {
  const mutedForeground = useCSSVariable('--color-muted-foreground');

  useAccountErrorToast();

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View className="gap-4 px-6">
        <ThemedText type="headlineSm">
          {kind === 'buy' ? 'Your plan needs an account' : 'Sign in to restore'}
        </ThemedText>

        <SamwellText type="bodyMd" color={asColor(mutedForeground)}>
          {kind === 'buy'
            ? `${planLabel ?? 'He'} thinks on our servers, so a plan is a monthly balance of Neurons counted against your account. There is nowhere else to keep it.`
            : 'A plan belongs to an account rather than to a phone, so signing in is how yours comes back to this device.'}
        </SamwellText>

        <SamwellText type="bodyMd" color={asColor(mutedForeground)}>
          It also carries your plan to any device you read on. Your books, highlights and
          conversations stay on this one.
        </SamwellText>

        <AccountEntryButtons onSignedIn={onSignedIn} />
      </View>
    </Sheet>
  );
}
