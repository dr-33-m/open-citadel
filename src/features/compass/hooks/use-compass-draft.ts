import React from 'react';
import type { TextInput } from 'react-native';

import { useCompassStore } from '@/stores/compass';
import { useSamwellSessionStore } from '@/stores/samwell-session';

/**
 * The goal or check-in card the conversation has reached, if any, and what
 * its two buttons do.
 *
 * Samwell puts one on screen with `propose_goal` or `propose_adjustments`;
 * the card writes nothing until it is approved. It belongs to the
 * conversation that made it, and the chat store drops it when that
 * conversation changes or something new is said.
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

  const approve = React.useCallback(async () => {
    if (!draft) return;
    if (draft.kind === 'plan') {
      const goalId = await commitProposal(draft.proposal);
      if (goalId) setSession({ compassDraft: null, refining: false });
      return;
    }
    await applyCheckinDraft(draft.draft);
    setSession({ compassDraft: null });
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

  return { draft, titles, approve, refine, committing };
}

const EMPTY_TITLES: Record<string, string> = {};

export type CompassDraftProps = ReturnType<typeof useCompassDraft>;
