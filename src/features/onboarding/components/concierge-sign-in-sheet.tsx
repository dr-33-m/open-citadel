import React from 'react';

import { AccountAsk } from '@/components/account/account-ask';
import { Sheet } from '@/components/ui/sheet';

const LINES = [
  'Grand Maester Samwell runs in the cloud, so he needs an account to answer for the work. Setting you up is on the house.',
  'Your books, highlights, notes and conversations stay on this device. The account never holds them.',
];

/**
 * The account, asked for at the one moment it is obviously worth having.
 *
 * Onboarding's words in the shared ask (`AccountAsk`), which is what draws
 * them and the two buttons under them.
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
  return (
    <Sheet visible={visible} onClose={onClose}>
      <AccountAsk title="First, an account" lines={LINES} onSignedIn={onSignedIn} />
    </Sheet>
  );
}
