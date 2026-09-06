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
  /**
   * Names a recurring notice, so a fresh one REPLACES the copy still on screen
   * rather than stacking a second behind it.
   *
   * For a notice the same thing can raise twice in quick succession: a scan at
   * launch and a scan the reader pulled for can both land inside three
   * seconds, and two lines about one folder is one line too many. The newer
   * one is also the truer one, so it takes the older one's place.
   *
   * Unkeyed toasts never replace anything. Two logs in a row are two events
   * and both deserve their own line.
   */
  key?: string;
};

export type ToastEntry = ToastOptions & {
  id: number;
  /**
   * Bumped every time a keyed toast is written over in place. The item watches
   * it to restart its dismiss timer — the content changed, so the three
   * seconds someone has to read it start again.
   */
  revision: number;
  /** Set the moment the exit starts. It leaves the stack maths immediately,
   *  so the toasts behind it close the gap while this one is still fading. */
  exiting?: boolean;
};
