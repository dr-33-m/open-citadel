import { useObserve } from 'expo-observe';
import React from 'react';

/**
 * The screen's "ready to use" moment, for its time to interactive. Call the
 * returned function when the screen's content has painted (`Handover`'s
 * `onShown`); only the first call counts.
 */
export function useScreenInteractive(): () => void {
  const { markInteractive } = useObserve();
  const marked = React.useRef(false);
  return React.useCallback(() => {
    if (marked.current) return;
    marked.current = true;
    try {
      markInteractive();
    } catch {
      // Not reached.
    }
  }, [markInteractive]);
}

/** Marks the screen interactive once `ready` turns true. For screens that draw without a `Handover`. */
export function useInteractiveWhen(ready: boolean): void {
  const mark = useScreenInteractive();
  React.useEffect(() => {
    if (ready) mark();
  }, [ready, mark]);
}
