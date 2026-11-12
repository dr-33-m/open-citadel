import React from 'react';

import { useSheetSettled } from '@/components/ui/sheet';
import { nextArmed } from '@/features/chat/utils/armed-rows';

/**
 * How many of a sheet's rows can be swiped: those with an index below the
 * count. None until the sheet has landed, then a few more each frame
 * (`nextArmed`), so no single frame pays for a screenful.
 *
 * Every swipe row is a pan gesture, seven animated values and four animated
 * styles, which cost well over a second for a screenful on a Galaxy A33 (dev
 * build). Mounted all at once, as the History list once did after landing,
 * nothing could be scrolled until they had: the sheet sat frozen. Gained all
 * in one render, each row remounting inside its swipe, they were a hitch of
 * their own. So the rows come up plain and the swipes arrive a few rows a
 * frame from the top, in renders React may set aside for a touch; a row cannot
 * be swiped before anyone could reach it anyway.
 */
export function useArmedRows(total: number): number {
  const settled = useSheetSettled();
  const [armed, setArmed] = React.useState(0);

  React.useEffect(() => {
    if (!settled || armed === Infinity) return;
    // One step a frame: each waits for the last one's commit before the next.
    const frame = requestAnimationFrame(() => React.startTransition(() => setArmed((n) => nextArmed(n, total))));
    return () => cancelAnimationFrame(frame);
  }, [settled, armed, total]);

  return armed;
}
