import React from 'react';

import { showToast } from '@/components/toast/toast-provider';
import { useAccountStore } from '@/stores/account';

/**
 * Account trouble, reported as a toast.
 *
 * Both account surfaces used to draw the store's `error` as a red line inside
 * themselves, which is the wrong shape for this: it pushes the card's own
 * layout around, it sits there after the reader has moved on, and the same
 * decision was written twice. A toast says it once, over whatever is on
 * screen, and leaves.
 *
 * Clearing the error is part of reporting it. Without that, the next render
 * of either surface would show the same toast again, and a stale failure
 * would follow the reader back to Settings long after it stopped being true.
 */
export function useAccountErrorToast(): void {
  const error = useAccountStore((s) => s.error);
  const clearError = useAccountStore((s) => s.clearError);

  React.useEffect(() => {
    if (!error) return;
    showToast({ message: error, key: 'account' });
    clearError();
  }, [error, clearError]);
}
