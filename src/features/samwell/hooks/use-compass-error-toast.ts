import React from 'react';

import { showToast } from '@/components/toast/toast-provider';
import { useCompassError, useCompassStore } from '@/stores/compass';

const COMPASS_ERROR_TOAST = 'compass-error';

/**
 * Says a Compass failure in a toast (a goal that would not save, a sixth goal
 * past the limit), then clears it, so the next one is said again. It used to
 * be red text over the composer, which pushed the card up and stayed after it
 * had stopped being true.
 */
export function useCompassErrorToast() {
  const error = useCompassError();
  React.useEffect(() => {
    if (!error) return;
    showToast({ key: COMPASS_ERROR_TOAST, message: error });
    useCompassStore.getState().clearError();
  }, [error]);
}
