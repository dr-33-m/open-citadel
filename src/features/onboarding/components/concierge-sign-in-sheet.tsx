import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { AccountEntryButtons } from '@/components/account/account-entry-buttons';
import { SamwellText } from '@/components/samwell-text';
import { Sheet } from '@/components/ui/sheet';
import { ThemedText } from '@/components/themed-text';
import { useAccountStore } from '@/stores/account';
import { asColor } from '@/utils/colors';

/**
 * The account, asked for at the one moment it is obviously worth having.
 *
 * Deliberately short. This is not the place to make the privacy argument in
 * full — the settings sheet does that, and somebody who has had the app
 * installed for ninety seconds is not reading a policy. Two lines: what they
 * get, and what it does not take.
 *
 * The buttons are the same two the account card draws, from the same file, so
 * the two front doors cannot end up behaving differently in the two places
 * they appear.
 */
export function ConciergeSignInSheet({
  visible,
  onClose,
  onSignedIn,
}: {
  visible: boolean;
  onClose: () => void;
  onSignedIn: () => void;
}) {
  const [mutedForeground, destructive] = useCSSVariable([
    '--color-muted-foreground',
    '--color-destructive',
  ]);

  const error = useAccountStore((s) => s.error);

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View className="gap-4 px-6">
        <ThemedText type="headlineSm">First, an account</ThemedText>

        <SamwellText type="bodyMd" color={asColor(mutedForeground)}>
          Grand Maester Samwell runs in the cloud, so he needs an account to answer for the work.
          Setting you up is on the house.
        </SamwellText>

        <SamwellText type="bodyMd" color={asColor(mutedForeground)}>
          Your books, highlights, notes and conversations stay on this device. The account never
          holds them.
        </SamwellText>

        <AccountEntryButtons onSignedIn={onSignedIn} />

        {/* Same treatment the account card gives its own warning line. */}
        {error && (
          <ThemedText type="bodySm" color={asColor(destructive)} style={{ fontSize: 11 }}>
            {error}
          </ThemedText>
        )}
      </View>
    </Sheet>
  );
}
