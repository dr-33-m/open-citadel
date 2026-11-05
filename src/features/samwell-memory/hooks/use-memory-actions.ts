import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React from 'react';

import { Undo2 } from '@/components/icons';
import { showToast } from '@/components/toast/toast-provider';
import type { MemoryTarget } from '@/features/samwell-memory/utils/memory-rows';
import { queryClient } from '@/lib/query-client';
import { backTo } from '@/navigation/navigate';
import { SIDE_CLOSE } from '@/navigation/transitions';
import { samwellMemoryKeys } from '@/query-manager/samwell-memory';
import { showChatAfterLeaving } from '@/services/samwell-handoff';
import {
  correctNote,
  correctProfile,
  forgetEverything,
  forgetNote,
  forgetProfile,
  restoreNote,
  restoreProfile,
} from '@/services/samwell-memory';

const TOAST = 'samwell-memory';
/** After the drawer's close, a frame or two for it to settle. */
const LANDED_MARGIN_MS = 60;

/** A write, and what undoes it when there is something to undo. */
type Work = () => (() => void) | void;

/**
 * Every change the reader can make to what he kept. Forgetting one piece is
 * a slip worth forgiving, so it is undone from the toast that reports it
 * rather than asked about first; only forgetting everything is confirmed.
 */
export function useMemoryActions() {
  const router = useRouter();
  const { mutate } = useMutation({
    mutationFn: async (work: Work) => work(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: samwellMemoryKeys.all }),
    onError: () => showToast({ message: 'That did not save. Try again.', key: TOAST }),
  });

  const forget = React.useCallback(
    (target: MemoryTarget) => {
      const work: Work =
        target.kind === 'note'
          ? () => {
              const row = forgetNote(target.id);
              return row ? () => restoreNote(row) : undefined;
            }
          : () => {
              const row = forgetProfile();
              return row ? () => restoreProfile(row) : undefined;
            };
      const message = target.kind === 'note' ? 'He will forget that note.' : 'He will forget how he sees you.';
      mutate(work, {
        onSuccess: (undo) => {
          if (!undo) return;
          showToast({ message, key: TOAST, actionIcon: Undo2, actionLabel: 'Undo', onActionPress: () => mutate(undo) });
        },
      });
    },
    [mutate],
  );

  const correct = React.useCallback(
    (target: MemoryTarget, text: string) => {
      const work: Work = target.kind === 'note' ? () => correctNote(target.id, text) : () => correctProfile(text);
      mutate(work, {
        onSuccess: () => showToast({ message: 'He will remember it your way.', key: TOAST, tone: 'success' }),
      });
    },
    [mutate],
  );

  /** Out of Settings and onto the chat it came from, on the Samwell page. */
  const openChat = React.useCallback(
    (sessionId: string) => showChatAfterLeaving(sessionId, () => backTo(router, '/'), SIDE_CLOSE.duration + LANDED_MARGIN_MS),
    [router],
  );

  const forgetAll = React.useCallback(() => mutate(forgetEverything), [mutate]);

  return { forget, correct, openChat, forgetAll };
}
