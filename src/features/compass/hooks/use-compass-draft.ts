import React from 'react';
import type { TextInput } from 'react-native';

import { showToast } from '@/components/toast/toast-provider';
import { DRAFT_FAILED_MESSAGE, draftDoneLabel, draftLandedMessage } from '@/features/compass/utils/draft-landed';
import { useCompassStore } from '@/stores/compass';
import { useSamwellSessionStore } from '@/stores/samwell-session';
import { haptics } from '@/utils/haptics';

/** One key for both outcomes, so a retry's toast writes over the failure's. */
const DRAFT_TOAST = 'compass-draft';

/**
 * The goal or check-in card the conversation has reached, if any, and what
 * its two buttons do.
 *
 * Samwell puts one on screen with `propose_goal` or `propose_adjustments`;
 * the card writes nothing until it is approved. Approved, it stays where it
 * was with a status line in place of its buttons, since Samwell's line under
 * it still refers to it. It belongs to the conversation that made it, and the
 * chat store drops it when that conversation changes or something new is said.
 */
export function useCompassDraft(inputRef?: React.RefObject<TextInput | null>) {
  const draft = useSamwellSessionStore((s) => s.compassDraft);
  const setSession = useSamwellSessionStore((s) => s.set);
  const committing = useCompassStore((s) => s.committing);
  const commitProposal = useCompassStore((s) => s.commitProposal);
  const applyCheckinDraft = useCompassStore((s) => s.applyCheckinDraft);
  const trackables = useCompassStore((s) => s.trackables);
  // Only a check-in names trackables, so a goal card never pays for the map.
  const checkin = draft?.kind === 'checkin';
  const titles = React.useMemo(
    () => (checkin ? Object.fromEntries(trackables.map((t) => [t.id, t.title])) : EMPTY_TITLES),
    [checkin, trackables],
  );

  /*
   * Writes the card, then says so: the card used to vanish, and that was the
   * only sign it had worked. A goal the store refused (the cap) is already
   * said by the store's own toast; a write that threw is said here, and the
   * card keeps its buttons to retry.
   */
  const approve = React.useCallback(async () => {
    if (!draft || draft.applied) return;
    try {
      if (draft.kind === 'plan') {
        const goalId = await commitProposal(draft.proposal);
        if (!goalId) return;
      } else {
        await applyCheckinDraft(draft.draft);
      }
      setSession({ compassDraft: { ...draft, applied: true }, refining: false });
      haptics.commit();
      showToast({ key: DRAFT_TOAST, message: draftLandedMessage(draft) });
    } catch (err) {
      console.warn('[Compass] Could not apply the card:', err);
      haptics.warn();
      showToast({ key: DRAFT_TOAST, message: DRAFT_FAILED_MESSAGE });
    }
  }, [draft, commitProposal, applyCheckinDraft, setSession]);

  /**
   * Work on it more.
   *
   * The card stays on screen and the cursor goes to the composer: the reader
   * is about to say what is wrong with the proposal, and they need to be able
   * to see it while they do. The next send clears it.
   */
  const refine = React.useCallback(() => {
    setSession({ refining: true, draft: '' });
    inputRef?.current?.focus();
  }, [setSession, inputRef]);

  const done = draftDoneLabel(draft);

  return { draft, titles, approve, refine, committing, done };
}

const EMPTY_TITLES: Record<string, string> = {};

export type CompassDraftProps = ReturnType<typeof useCompassDraft>;
