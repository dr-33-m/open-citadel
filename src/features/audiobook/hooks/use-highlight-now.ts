import React from 'react';

import { Undo2 } from '@/components/icons';
import { showToast } from '@/components/toast/toast-provider';
import { highlightNow, undoHighlight } from '@/services/audiobook';
import { haptics } from '@/utils/haptics';

const TOAST = 'audiobook-highlight';

/**
 * Highlight, from the player or the mini player: the sentence being heard is
 * saved, felt as a commit, and said in a toast that can take it back. A
 * second press on the same sentence saves nothing new and says so again,
 * with the same way back. Keyed, so presses in a row write over one toast.
 */
export function useHighlightNow() {
  return React.useCallback(async () => {
    const result = await highlightNow();
    if (result.kind === 'none') return;
    haptics.commit();
    showToast({
      key: TOAST,
      message: 'Highlighted',
      tone: 'success',
      actionIcon: Undo2,
      actionLabel: 'Undo',
      onActionPress: () => void undoHighlight(result.sentenceId),
    });
  }, []);
}
