import React from 'react';

import { calendarMonthLabel } from '@/lib/date';
import { useSamwellUiStore } from '@/stores/samwell-ui';

/**
 * Long enough for the toolbox to finish rising, or its tabs to finish
 * cross-fading, before the warm-up takes the JS thread.
 */
const WARM_AFTER_MS = 450;

/**
 * Whether the Compass sheets should be wired up ahead of a tap.
 *
 * The first open of a Compass sheet cost two to three times a later one on a
 * Galaxy A33 (Log today 610ms against 260): the sheet's own hooks deriving the
 * deck or the month from the store for the first time, and the first date
 * formatter the process ever builds with a calendar tag (93ms on its own, for
 * the planner's month title). None of that needs the sheet to be open, and a
 * reader looking at the Compass tab is about to open one, so it is done then,
 * once the drawer has settled, instead of between the tap and the rise.
 *
 * Latched: once warm, the sheets stay wired for the rest of the visit, the
 * same as `WhenOpened` after a first open.
 */
export function useCompassWarm(): boolean {
  const showing = useSamwellUiStore((s) => s.toolboxOpen && s.toolboxTab === 'compass');
  const [warm, setWarm] = React.useState(false);

  React.useEffect(() => {
    if (!showing || warm) return;
    const timer = setTimeout(() => {
      // The planner's month title, built once here so its formatter is
      // cached (`lib/date`) before the planner asks for it.
      calendarMonthLabel(new Date(), 'gregory', undefined);
      setWarm(true);
    }, WARM_AFTER_MS);
    return () => clearTimeout(timer);
  }, [showing, warm]);

  return warm;
}
