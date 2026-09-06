import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { LogIn, LogOut, Mail, UserPlus } from '@/components/icons';
import { ActionButton } from '@/components/action-button';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { PrefixIcon } from '@/components/ui/prefix-icon';
import { showToast } from '@/components/toast/toast-provider';
import { ACCOUNT_ENABLED } from '@/constants/logto';
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
  const signIn = useAccountStore((s) => s.signIn);
  const signOut = useAccountStore((s) => s.signOut);

  const [confirming, setConfirming] = React.useState(false);

  // A build made with no Logto credentials has no accounts, which is a
  // configuration and not a fault. Nothing is drawn and nothing explains
  // itself, because there is nothing here the reader could act on.
  if (!ACCOUNT_ENABLED) return null;

  const signedIn = status === 'signedIn';

  const enter = async (entry: 'sign_in' | 'register') => {
    await signIn(entry);
    // Read after the action rather than from the closure: `signedIn` above is
    // this render's answer, and the whole point of the await is that it is now
    // out of date.
    if (useAccountStore.getState().status === 'signedIn') {
      showToast({ message: 'Signed in.', tone: 'success', key: 'account' });
    }
  };

  const leave = async () => {
    await signOut();
    if (useAccountStore.getState().status === 'signedOut') {
      showToast({ message: 'Signed out.', key: 'account' });
    }
  };

  return (
    <>
      <Card className="gap-3 p-4">
        <View className="flex-row items-center gap-3">
          <PrefixIcon icon={signedIn ? Mail : LogIn} size={36} />
          <View className="flex-1 gap-0.5">
            <ThemedText type="bodyMd" numberOfLines={1}>
              {signedIn ? (email ?? name ?? 'Signed in') : 'No account'}
            </ThemedText>
            <ThemedText type="bodySm" color={asColor(mutedForeground)} numberOfLines={2}>
              {signedIn
                ? 'Grand Maester Samwell works from this account.'
                : 'Optional. Sign in to use Grand Maester Samwell.'}
            </ThemedText>
          </View>
        </View>

        {/* The buttons sit under the row rather than beside it. Two of them
            next to a wrapping two-line description is the layout that ate its
            own right padding on the Reach Out row. */}
        <View className="flex-row flex-wrap gap-2">
          {signedIn ? (
            <ActionButton
              icon={LogOut}
              label="SIGN OUT"
              tint={asColor(mutedForeground)}
              disabled={busy}
              onPress={() => setConfirming(true)}
            />
          ) : (
            <>
              <ActionButton
                icon={LogIn}
                label="SIGN IN"
                tint={asColor(mutedForeground)}
                disabled={busy}
                onPress={() => void enter('sign_in')}
              />
              <ActionButton
                icon={UserPlus}
                label="CREATE ACCOUNT"
                tint={asColor(mutedForeground)}
                disabled={busy}
                onPress={() => void enter('register')}
              />
            </>
          )}
        </View>

        {/* Same treatment the cloud panel gives its own warning line, so the
            two settings surfaces report trouble the same way. */}
        {error && (
          <ThemedText type="bodySm" color={asColor(destructive)} style={{ fontSize: 11 }}>
            {error}
          </ThemedText>
        )}
      </Card>

      <ConfirmSignOutSheet
        visible={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => void leave()}
      />
    </>
  );
}
