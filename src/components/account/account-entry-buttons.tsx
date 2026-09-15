import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { LogIn, UserPlus } from '@/components/icons';
import { ActionButton } from '@/components/action-button';
import { GoldButton } from '@/components/ui/gold-button';
import { showToast } from '@/components/toast/toast-provider';
import { useAccountStore } from '@/stores/account';
import { asColor } from '@/utils/colors';

/**
 * The two front doors into one flow.
 *
 * Sign in and create account are the same hosted Logto flow opened on
 * different first screens, which is why they are one component and not two:
 * somebody who tapped the wrong one can still get where they were going
 * without coming back.
 *
 * One of them is gold, and that is the point. Two identical bordered buttons
 * gave the account card no primary path, so the eye had to read both labels to
 * find the common one. Signing in is what most people are here to do; making
 * an account is the same flow with a different first screen, so it stays quiet
 * beside it.
 *
 * `small` on the gold one is `ActionButton`'s box to the pixel. `compact`
 * stood 6pt taller than its neighbour, and two buttons on one baseline at
 * different heights read as a mistake rather than as a hierarchy.
 *
 * Lifted out of `features/settings/components/account-card` when onboarding's
 * sign-in sheet became the second place that needed exactly this. It was one
 * copy then; a second would have been the first chance for them to drift.
 */
export function AccountEntryButtons({
  onSignedIn,
  className = 'flex-row flex-wrap items-center gap-2',
}: {
  /** Called after a sign-in that actually landed. */
  onSignedIn?: () => void;
  /** Overrides the row layout for a caller that stacks them instead. */
  className?: string;
}) {
  const [mutedForeground] = useCSSVariable(['--color-muted-foreground']);

  // Field by field, as everywhere else. `busy` changes twice per sign-in.
  const busy = useAccountStore((s) => s.busy);
  const signIn = useAccountStore((s) => s.signIn);

  const enter = async (entry: 'sign_in' | 'register') => {
    await signIn(entry);
    // Read after the action rather than from a render's closure: the whole
    // point of the await is that what this component last drew is now out of
    // date.
    if (useAccountStore.getState().status === 'signedIn') {
      showToast({ message: 'Signed in.', tone: 'success', key: 'account' });
      onSignedIn?.();
    }
  };

  return (
    <View className={className}>
      {/* `loading` covers the wait nobody sees coming: the browser closes, and
          reading the session back off the device takes long enough that
          without it the card looks like it ignored the whole thing. */}
      <GoldButton
        label="SIGN IN"
        icon={LogIn}
        size="small"
        disabled={busy}
        loading={busy}
        onPress={() => void enter('sign_in')}
      />
      <ActionButton
        icon={UserPlus}
        label="CREATE ACCOUNT"
        tint={asColor(mutedForeground)}
        disabled={busy}
        onPress={() => void enter('register')}
      />
    </View>
  );
}
