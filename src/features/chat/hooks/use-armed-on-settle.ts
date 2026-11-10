import React from 'react';

import { useSheetSettled } from '@/components/ui/sheet';

/**
 * Whether the rows can be swiped: once the sheet has landed, and switched on
 * as a transition.
 *
 * Every swipe row is a pan gesture, seven animated values and four animated
 * styles, which cost well over a second for a screenful on a Galaxy A33 (dev
 * build). The list used to wait behind a still picture of its rows until the
 * sheet landed and then mount all of that at once, and nothing could be
 * scrolled until it had: the History sheet sat frozen, then started to move.
 * Now the list itself comes up with the sheet, its rows plain, so a drag
 * scrolls it from the first frame (the scroll is native and does not wait on
 * JS). The swipes are added after the rise, in a render React may set aside
 * for a touch, and a row cannot be swiped before anyone could reach it anyway.
 */
export function useArmedOnSettle(): boolean {
  const settled = useSheetSettled();
  const [armed, setArmed] = React.useState(false);
  React.useEffect(() => {
    if (settled && !armed) React.startTransition(() => setArmed(true));
  }, [settled, armed]);
  return armed;
}

