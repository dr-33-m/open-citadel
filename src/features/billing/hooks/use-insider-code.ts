import * as Clipboard from 'expo-clipboard';
import React from 'react';

import { showToast } from '@/components/toast/toast-provider';
import type { InsiderCodeSheetProps, InsiderCodeStep } from '@/features/billing/components/insider-code-sheet';
import { insiderWelcome, type InsiderWelcome } from '@/features/billing/utils/insider';
import { readCloudIdentity } from '@/hooks/use-cloud-identity';
import { useSubscriptionStore } from '@/stores/subscription';
import { haptics } from '@/utils/haptics';
import { isCompleteInsiderCode, normalizeInsiderCode } from 'samwell-shared';

/** One toast at a time for a code: a second failure writes over the first. */
const TOAST = 'insider-code';

/**
 * Redeeming an insider code: which step the sheet is on, the code being
 * typed, and what came of asking about it.
 *
 * A code needs an account. It is spent once, and a plan held by a phone
 * rather than a person would be lost with the phone. So opening the sheet
 * with nobody signed in starts it on the account ask, and a sign-in that
 * lands moves it on to the code.
 *
 * `onActivated` runs when a code has put a plan on the account.
 */
export function useInsiderCode({ onActivated }: { onActivated?: () => void } = {}): {
  open: () => void;
  sheet: InsiderCodeSheetProps;
} {
  const redeem = useSubscriptionStore((s) => s.redeemInsider);
  const [visible, setVisible] = React.useState(false);
  const [step, setStep] = React.useState<InsiderCodeStep>('code');
  const [code, setCode] = React.useState('');
  // The field is uncontrolled, so a new key is how it is told to start again.
  const [field, setField] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [welcome, setWelcome] = React.useState<InsiderWelcome | null>(null);

  const open = React.useCallback(() => {
    // Read at the tap, not from a render: the sheet is opened through a ref
    // by a screen that does not redraw when somebody signs in.
    setStep(readCloudIdentity().kind === 'account' ? 'code' : 'account');
    setCode('');
    setField((n) => n + 1);
    setWelcome(null);
    setVisible(true);
  }, []);

  const close = React.useCallback(() => setVisible(false), []);
  const onSignedIn = React.useCallback(() => setStep('code'), []);

  const onChange = React.useCallback((text: string) => setCode(normalizeInsiderCode(text)), []);

  const onPaste = React.useCallback(async () => {
    const pasted = normalizeInsiderCode(await Clipboard.getStringAsync().catch(() => ''));
    if (!pasted) {
      showToast({ message: 'There is no code on the clipboard.', key: TOAST });
      return;
    }
    setCode(pasted);
    setField((n) => n + 1);
  }, []);

  const onSubmit = React.useCallback(async () => {
    if (busy || !isCompleteInsiderCode(code)) return;
    setBusy(true);
    const outcome = await redeem(code);
    setBusy(false);
    if (!outcome.ok) {
      // Said in a toast, over the sheet, and gone: the field keeps what was
      // typed, so a slip can be mended rather than started again.
      haptics.warn();
      showToast({ message: outcome.message, key: TOAST });
      return;
    }
    haptics.commit();
    setWelcome(insiderWelcome(outcome.redemption));
    setStep('done');
    onActivated?.();
  }, [busy, code, onActivated, redeem]);

  return {
    open,
    sheet: {
      visible,
      step,
      welcome,
      onSignedIn,
      onClose: close,
      form: {
        code,
        fieldKey: String(field),
        complete: isCompleteInsiderCode(code),
        busy,
        onChange,
        onPaste: () => void onPaste(),
        onSubmit: () => void onSubmit(),
      },
    },
  };
}
