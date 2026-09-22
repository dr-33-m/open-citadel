import React from 'react';

import { showToast } from '@/components/toast/toast-provider';
import { useGuestStore } from '@/stores/guest';

/**
 * A tester's reset for "buy as a guest, then sign in".
 *
 * Linking marks the device for good, so it can only run that flow once, and
 * on Android the mark goes only with the app's storage - books included.
 * This forgets the mark and nothing else. Hidden behind a long-press because
 * no reader needs it, and harmless if one finds it: only a linked device is
 * touched, and its plan already lives on the account.
 */
export function useForgetDeviceLink(): () => void {
  return React.useCallback(() => {
    void (async () => {
      let forgot: boolean;
      try {
        forgot = await useGuestStore.getState().forgetLink();
      } catch (error) {
        if (__DEV__) console.warn('[Guest] Could not forget the device link:', error);
        showToast({ message: 'Could not reset this device. Try again.', key: 'billing' });
        return;
      }
      showToast({
        message: forgot
          ? 'This device is no longer linked. It can buy as a new guest.'
          : 'This device is not linked to an account.',
        key: 'billing',
      });
    })();
  }, []);
}
