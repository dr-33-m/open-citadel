import type React from 'react';

/** An icon component in the lucide shape, which is every icon this app uses. */
export type ToastIcon = React.ComponentType<{ size?: number; color?: string }>;

export type ToastOptions = {
  /** One line, two at most. Anything longer belongs on a screen. */
  message: string;
  /**
   * A single trailing control, drawn as a bare icon with `hitSlop` rather than
   * a button. A toast is one line tall and a real button's box makes it two.
   */
  actionIcon?: ToastIcon;
  /** Required with `actionIcon`: it is the control's only accessible name. */
  actionLabel?: string;
  onActionPress?: () => void;
  /** A tick when something worked, nothing when it is merely recorded. */
  tone?: 'default' | 'success';
};

export type ToastEntry = ToastOptions & {
  id: number;
  /** Set the moment the exit starts. It leaves the stack maths immediately,
   *  so the toasts behind it close the gap while this one is still fading. */
  exiting?: boolean;
};
