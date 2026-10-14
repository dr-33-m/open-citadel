import React from 'react';

import { AccountAsk } from '@/components/account/account-ask';
import { Sheet } from '@/components/ui/sheet';
import { InsiderCodeDone, type InsiderCodeDoneProps } from '@/features/billing/components/insider-code-done';
import { InsiderCodeForm, type InsiderCodeFormProps } from '@/features/billing/components/insider-code-form';

const ACCOUNT_LINES = [
  'An insider code is kept in your name, so its plan works on any device you sign in on.',
  'Your books, highlights, notes and conversations stay on this device. The account never holds them.',
];

/** Where the sheet is: asking for an account, taking the code, or showing what it opened. */
export type InsiderCodeStep = 'account' | 'code' | 'done';

export type InsiderCodeSheetProps = {
  visible: boolean;
  step: InsiderCodeStep;
  form: InsiderCodeFormProps;
  /** Null until a code has been redeemed. */
  welcome: InsiderCodeDoneProps['welcome'] | null;
  onSignedIn: () => void;
  onClose: () => void;
};

/**
 * Redeeming an insider code, from the tap to the plan.
 *
 * One sheet for the whole of it. Somebody with no account is asked for one
 * first, and the same sheet carries on to the code once they are in, rather
 * than closing on them and leaving them to find the link again.
 */
export function InsiderCodeSheet({ visible, step, form, welcome, onSignedIn, onClose }: InsiderCodeSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      {step === 'account' ? (
        <AccountAsk title="First, an account" lines={ACCOUNT_LINES} onSignedIn={onSignedIn} />
      ) : step === 'done' && welcome ? (
        <InsiderCodeDone welcome={welcome} onDone={onClose} />
      ) : (
        <InsiderCodeForm {...form} />
      )}
    </Sheet>
  );
}
