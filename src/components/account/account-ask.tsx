import React from 'react';
import { View } from 'react-native';

import { AccountEntryButtons } from '@/components/account/account-entry-buttons';
import { SamwellText } from '@/components/samwell-text';
import { ThemedText } from '@/components/themed-text';
import { useAccountErrorToast } from '@/hooks/use-account-error-toast';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

/**
 * An account, asked for at the moment something needs one: why, in a line or
 * two, and the two ways in.
 *
 * The body of a sheet rather than a sheet, so whatever was being done can
 * carry on in the same one once the sign-in lands. Onboarding's concierge
 * asks with it, and so does an insider code, which is why it is here: the
 * second ask would otherwise have been a second copy of the first.
 *
 * Deliberately short. This is not the place to make the privacy argument in
 * full, which the settings sheet does. Say what they get, and what it does
 * not take.
 */
export function AccountAsk({
  title,
  lines,
  onSignedIn,
}: {
  title: string;
  /** Why an account, then what it leaves alone. Two at most. */
  lines: string[];
  onSignedIn: () => void;
}) {
  const muted = useThemeTokens()['--color-muted-foreground'];

  useAccountErrorToast();

  return (
    <View className="gap-4 px-6">
      <ThemedText type="headlineSm">{title}</ThemedText>
      {lines.map((line) => (
        <SamwellText key={line} type="bodyMd" color={muted}>
          {line}
        </SamwellText>
      ))}
      {/* The same two the account card draws, from the same file, so the
          front doors cannot end up behaving differently in the places they
          appear. */}
      <AccountEntryButtons onSignedIn={onSignedIn} />
    </View>
  );
}
