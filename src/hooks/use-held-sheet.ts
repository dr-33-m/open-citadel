import React from 'react';

/**
 * A sheet that shows one thing at a time, chosen as it opens: the sources of
 * one reply, the thinking behind another. `open(value)` is what a reply's
 * button calls; the rest goes onto the sheet. The value stays put while the
 * sheet closes, so it slides away full rather than empty.
 *
 * One per conversation, not one per reply: a sheet mounted per row is the
 * cost the transcript avoids.
 */
export function useHeldSheet<T>(empty: T): {
  open: (value: T) => void;
  visible: boolean;
  value: T;
  onClose: () => void;
} {
  const [value, setValue] = React.useState<T>(empty);
  const [visible, setVisible] = React.useState(false);
  const open = React.useCallback((next: T) => {
    setValue(next);
    setVisible(true);
  }, []);
  const onClose = React.useCallback(() => setVisible(false), []);
  return { open, visible, value, onClose };
}
