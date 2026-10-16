import * as Clipboard from 'expo-clipboard';

import { showToast } from '@/components/toast/toast-provider';

/** One key, so copying twice in a row writes over the first toast rather than stacking a second. */
const TOAST_KEY = 'copied';

/**
 * Puts text on the clipboard and says so in a toast: "Reply copied",
 * "Message copied". A copy that does not land says that instead, since the
 * reader would otherwise paste whatever was there before.
 */
export function copyText(text: string, said: string): void {
  Clipboard.setStringAsync(text).then(
    () => showToast({ key: TOAST_KEY, message: said }),
    () => showToast({ key: TOAST_KEY, message: 'Could not copy that' }),
  );
}
