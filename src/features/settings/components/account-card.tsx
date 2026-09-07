import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { LogOut, UserStar } from '@/components/icons';
import { AccountEntryButtons } from '@/components/account/account-entry-buttons';
import { ActionButton } from '@/components/action-button';
import { SamwellText } from '@/components/samwell-text';
import { ThemedText } from '@/components/themed-text';
import { Badge } from '@/components/ui/badge';
import { showToast } from '@/components/toast/toast-provider';
import { Card } from '@/components/ui/card';
import { PrefixIcon } from '@/components/ui/prefix-icon';
import { Touchable } from '@/components/ui/touchable';
import { ACCOUNT_ENABLED } from '@/constants/logto';
import { CloudAccountSheet } from '@/features/settings/components/cloud-account-sheet';
import { ConfirmSignOutSheet } from '@/features/settings/components/confirm-sign-out-sheet';
import { useAccountStore } from '@/stores/account';
import { asColor } from '@/utils/colors';

/**
 * The account, and the only place in the app that offers one.
 *
 * Optional by design. A reader who never signs in loses nothing local — the
 * books, the highlights, the notes and the on-device Samwell all work exactly
 * as they did. What an account buys is Grand Maester Samwell, who runs on a
 * server and needs somebody to answer for the work.
 *
 * Sign in and create account are one flow with two front doors, so the two
 * buttons differ only in which screen Logto opens on. Someone who tapped the
 * wrong one can still get where they were going without coming back here.
 */
export function AccountCard() {
  const [mutedForeground, destructive] = useCSSVariable([
    '--color-muted-foreground',
    '--color-destructive',
  ]);

  // Field by field, as everywhere else. `busy` changes twice per sign-in and
  // this card is on a screen that draws six other sections.
  const status = useAccountStore((s) => s.status);
  const email = useAccountStore((s) => s.email);
  const name = useAccountStore((s) => s.name);
  const busy = useAccountStore((s) => s.busy);
  const error = useAccountStore((s) => s.error);
  const signOut = useAccountStore((s) => s.signOut);

  const [confirming, setConfirming] = React.useState(false);
  const [explaining, setExplaining] = React.useState(false);

  // A build made with no Logto credentials has no accounts, which is a
  // configuration and not a fault. Nothing is drawn and nothing explains
  // itself, because there is nothing here the reader could act on.
  if (!ACCOUNT_ENABLED) return null;

  const signedIn = status === 'signedIn';

  const leave = async () => {
    await signOut();
    if (useAccountStore.getState().status === 'signedOut') {
      showToast({ message: 'Signed out.', key: 'account' });
    }
  };

  return (
    <>
      <Card className="gap-3 p-4">
        {/* `items-start`, not `items-center`. The text beside it runs to two
            lines, so centring floated the badge between them instead of
            beside the thing it names. */}
        <View className="flex-row items-start gap-3">
          {/* The same mark signed in or out. The card is the account either
              way, and swapping the icon on sign-in made the row look like it
              had become a different setting rather than the same one with an
              answer in it. */}
          <PrefixIcon icon={UserStar} size={36} />
          <View className="flex-1 gap-0.5">
            {/* The name of the thing on the left, what it costs you on the
                right. `justify-between` rather than a gap, so the badge holds
                the right edge whatever length the email above it runs to, and
                `shrink` lets the address give way rather than push it off. */}
            <View className="flex-row items-center justify-between gap-2">
              <ThemedText type="bodyMd" numberOfLines={1} className="shrink">
                {signedIn ? (email ?? name ?? 'Cloud Account') : 'Cloud Account'}
              </ThemedText>
              {/* Only while signed out. Once there is an account, saying it
                  was optional is answering a question nobody is still asking.

                  Filled rather than outlined: this card already carries the
                  card's own rule, the icon's, and the buttons' — a fourth 1px
                  rectangle at the same weight made a label look like a
                  control, and left nothing on the card looking dominant.

                  It IS tappable, which a filled chip does not advertise, and
                  that is the right trade here: "Optional" is a claim, and the
                  people who want it backed up are exactly the people who will
                  try pressing it. `hitSlop` because the chip itself is barely
                  a finger tall. */}
              {!signedIn && (
                <Touchable
                  onPress={() => setExplaining(true)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Why an account is optional"
                >
                  <Badge variant="secondary">Optional</Badge>
                </Touchable>
              )}
            </View>
            {/* `SamwellText`, so his name carries the gold here as it does in
                every other sentence about him. */}
            <SamwellText type="bodySm" color={asColor(mutedForeground)} numberOfLines={2}>
              {signedIn
                ? 'Grand Maester Samwell is all yours.'
                : 'Sign in or create account to use Grand Maester Samwell.'}
            </SamwellText>
          </View>
        </View>

        {/* The buttons sit under the row rather than beside it. Two of them
            next to a wrapping two-line description is the layout that ate its
            own right padding on the Reach Out row.
            One of them is gold, and that is the point. Two identical bordered
            buttons gave the card no primary path, so the eye had to read both
            labels to find the common one. Signing in is what most people are
            here to do; making an account is the same flow with a different
            first screen, so it stays quiet beside it. Gold is also what every
            other "this is the way forward" button in the app wears, including
            the SIGN IN on the Samwell page these two lead to. */}
        {signedIn ? (
          <View className="flex-row flex-wrap items-center gap-2">
            <ActionButton
              icon={LogOut}
              label="SIGN OUT"
              tint={asColor(mutedForeground)}
              disabled={busy}
              onPress={() => setConfirming(true)}
            />
          </View>
        ) : (
          // The same two buttons onboarding's sign-in sheet draws. See
          // `components/account/account-entry-buttons`.
          <AccountEntryButtons />
        )}

        {/* Same treatment the cloud panel gives its own warning line, so the
            two settings surfaces report trouble the same way. */}
        {error && (
          <ThemedText type="bodySm" color={asColor(destructive)} style={{ fontSize: 11 }}>
            {error}
          </ThemedText>
        )}
      </Card>

      <CloudAccountSheet visible={explaining} onClose={() => setExplaining(false)} />

      <ConfirmSignOutSheet
        visible={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => void leave()}
      />
    </>
  );
}
