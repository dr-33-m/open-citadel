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
  /**
   * The action's work is running: its icon becomes a spinner and stops taking
   * presses. Written by the caller over the same `key` once the action starts.
   */
  actionPending?: boolean;
  /** Accessible name for the close control, when declining means something
   *  more specific than dismissing. */
  dismissLabel?: string;
  /** Called when the close is pressed, so declining can be acted on. */
  onDismissPress?: () => void;
  /** A tick when something worked, nothing when it is merely recorded. */
  tone?: 'default' | 'success';
  /**
   * Holds the toast on screen until something settles it: the action, the
   * close, a swipe, or a keyed replacement.
   *
   * For a notice that asks a question rather than reporting an event. Three
   * seconds is the right life for "Renamed to X" and the wrong one for "Rename
   * this chat?", which vanishing unanswered would silently mean no.
   *
   * A persistent toast keeps its close control ALONGSIDE its action, which is
   * the one case where two icons on the row are justified: with no timer, the
   * close is the only way to decline, so the action cannot stand in for it.
   */
  persistent?: boolean;
  /**
   * Leaves the toast up when the action is pressed, so the caller can report
   * what happened by writing over it under the same `key`. Without this an
   * action that starts slow work dismisses the only thing saying it is running.
   */
  keepOpenOnAction?: boolean;
  /**
   * Something is under way that the reader is waiting on, and the toast says
   * so with a spinner in place of its controls. It stays until the caller
   * closes it with `dismissToast(key)`, so it needs a `key`.
   */
  busy?: boolean;
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
  /** Set by `dismissToast`: the item plays its exit, as a close would. */
  closing?: boolean;
};
