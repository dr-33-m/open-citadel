/**
 * Rename from the history sheet: which row is renaming, and the call that does it.
 *
 * A rename used to be offered on the way out of every conversation, whether or
 * not anything had been said since it was named, which made leaving a chat a
 * question every time. It is a swipe on the row now, so it only happens when
 * the reader wants a better name.
 *
 * The row stays open with a spinner while this runs and closes when it
 * settles, so success needs no notice of its own: the new title is already in
 * the row as it slides back. Only a failure says anything.
 *
 * Shared by reading chat and Compass, which keep separate stores and one sheet.
 */
import React from 'react';

import { showToast } from '@/components/toast/toast-provider';
import { RetitleError } from '@/services/chat-title';
import type { ChatSession } from '@/stores/chat';

/** One key, so a second failure replaces the first rather than stacking. */
const RENAME_TOAST_KEY = 'swipe-rename';

export function useSwipeRename(
  retitle: (id: string) => Promise<string>,
  /** Shown when the rename fails for a reason not written for people. */
  failureMessage: string,
) {
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  // Read synchronously, so two taps in one frame cannot both start a rename
  // before the state above has re-rendered.
  const busy = React.useRef(false);

  const rename = React.useCallback(
    async (session: ChatSession) => {
      if (busy.current) return;
      busy.current = true;
      setRenamingId(session.id);
      try {
        await retitle(session.id);
      } catch (err) {
        if (!(err instanceof RetitleError)) console.warn('[Chat] Could not rename session:', err);
        showToast({
          key: RENAME_TOAST_KEY,
          message: err instanceof RetitleError ? err.message : failureMessage,
        });
      } finally {
        busy.current = false;
        setRenamingId(null);
      }
    },
    [retitle, failureMessage],
  );

  return { renamingId, rename };
}
