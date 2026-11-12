import React from 'react';

import { performanceLine } from '@/features/settings/utils/performance-sharing';
import { setSharing, sharingEnabled } from '@/lib/observe';
import { haptics } from '@/utils/haptics';

/**
 * Settings' "Share app performance": off until the reader turns it on, and
 * only ever turned on from the sheet that says what it sends (`PerformanceSheet`).
 * The switch and the "i" both open that sheet while it is off; turning it off
 * is the switch alone, at once. Never asked about anywhere else, so a "no"
 * stays a no.
 */
export function usePerformanceSharing() {
  const [sharing, setLocal] = React.useState(sharingEnabled);
  const [open, setOpen] = React.useState(false);

  const apply = React.useCallback((next: boolean) => {
    setLocal(next);
    setSharing(next);
  }, []);
  const openInfo = React.useCallback(() => setOpen(true), []);
  const close = React.useCallback(() => setOpen(false), []);
  // On asks first; off needs no reading.
  const onSharingChange = React.useCallback((next: boolean) => (next ? setOpen(true) : apply(false)), [apply]);
  const accept = React.useCallback(() => {
    haptics.commit();
    apply(true);
    setOpen(false);
  }, [apply]);
  const turnOff = React.useCallback(() => {
    apply(false);
    setOpen(false);
  }, [apply]);

  return {
    row: { sharing, sharingLine: performanceLine(sharing), onSharingChange, onSharingInfo: openInfo },
    sheet: { visible: open, sharing, onAccept: accept, onTurnOff: turnOff, onClose: close },
  };
}
