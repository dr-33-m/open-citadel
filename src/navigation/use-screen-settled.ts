import { useEffect, useState } from 'react';
import { useIsFocused } from 'expo-router/react-navigation';

/**
 * True once the screen's entrance transition has had room to finish.
 *
 * Screens that stay mounted while inactive re-attach under React 19
 * `Activity` when they regain focus, and v4 pauses their effects while
 * hidden — which means everything gated on focus fires in the same burst
 * as the first frame of the rise. Measured on the A33, that burst is the
 * open transition's jank: the close, which pays no resume cost, runs
 * clean. Work that is not the transition's job — DB reads, network
 * refreshes, below-fold sections — gates on this instead of focus and
 * lands after the screen has settled rather than competing with it.
 *
 * The false→true→false edges are placed so no commit ever lands inside an
 * animation: focus flips true only after the rise (via the timer), and
 * flips back false only after the close has finished (the blur timer), so
 * below-fold content unmounts while the screen is off stage — invisible —
 * and never mid-gesture, where it would shrink the scroll under the
 * user's finger.
 */
export function useScreenSettled(settleMs = 350): boolean {
  const focused = useIsFocused();
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(focused), focused ? settleMs : 450);
    return () => clearTimeout(timer);
  }, [focused, settleMs]);

  return settled;
}
