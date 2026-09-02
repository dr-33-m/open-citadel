import React from 'react';
import type { TextInput } from 'react-native';

import { useCompassStore } from '@/stores/compass';
import { useSamwellSessionStore } from '@/stores/samwell-session';

export type CompassConversationKind = 'plan' | 'checkin';

/**
 * The Compass conversation: brainstorming a goal, or talking through one.
 *
 * Which of the two it is comes from whether a goal exists, not from a clock.
 * The old Compass decided between three conversations by the time of day, so
 * the reader could only talk to Samwell in a window he chose; now they open a
 * conversation when they need one, which is usually the moment they are stuck
 * rather than at 21:00.
 *
 * Each conversation starts fresh. A check-in is its own thread rather than a
 * continuation of the last one, so what Samwell knows comes from the logs and
 * the notes rather than from an ever-growing transcript.
 */
export function useCompassConversation(inputRef?: React.RefObject<TextInput | null>) {
  const messages = useSamwellSessionStore((s) => s.compassMessages);
  const draft = useSamwellSessionStore((s) => s.compassDraft);
  const setSession = useSamwellSessionStore((s) => s.set);
  const resetCompass = useSamwellSessionStore((s) => s.resetCompass);

  const activeGoalId = useCompassStore((s) => s.activeGoalId);
  const submitting = useCompassStore((s) => s.submitting);
  const streamingReply = useCompassStore((s) => s.streamingReply);
  const committing = useCompassStore((s) => s.committing);
  const sendPlanTurn = useCompassStore((s) => s.sendPlanTurn);
  const sendCheckinTurn = useCompassStore((s) => s.sendCheckinTurn);
  const commitProposal = useCompassStore((s) => s.commitProposal);
  const applyCheckinDraft = useCompassStore((s) => s.applyCheckinDraft);

  const kind: CompassConversationKind = activeGoalId ? 'checkin' : 'plan';

  const send = React.useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // Sending is what clears a draft: the reader has said something new, so
      // whatever Samwell last proposed is now the previous version.
      const next = [...messages, { role: 'user' as const, content: trimmed }];
      setSession({ compassMessages: next, compassDraft: null, refining: false });

      // Branch on the whole turn rather than on the draft: the two endpoints
      // return different draft shapes, and keeping each path in its own arm is
      // what lets the compiler check the shape instead of a cast asserting it.
      if (kind === 'plan') {
        const turn = await sendPlanTurn(next);
        if (!turn) return;
        setSession({
          compassMessages: [...next, { role: 'assistant', content: turn.reply }],
          compassDraft: turn.draft ? { kind: 'plan', proposal: turn.draft } : null,
        });
        return;
      }

      const turn = await sendCheckinTurn(next);
      if (!turn) return;
      setSession({
        compassMessages: [...next, { role: 'assistant', content: turn.reply }],
        compassDraft: turn.draft ? { kind: 'checkin', draft: turn.draft } : null,
      });
    },
    [messages, kind, sendPlanTurn, sendCheckinTurn, setSession],
  );

  const approve = React.useCallback(async () => {
    if (!draft) return;
    if (draft.kind === 'plan') {
      const goalId = await commitProposal(draft.proposal);
      if (goalId) resetCompass();
      return;
    }
    await applyCheckinDraft(draft.draft);
    setSession({ compassDraft: null });
  }, [draft, commitProposal, applyCheckinDraft, resetCompass, setSession]);

  /**
   * Work on it more.
   *
   * The draft stays on screen and the cursor goes to the composer. The old
   * REFINE button was wired to a no-op, and the reason it was never finished
   * is that dismissing the card is the obvious implementation and the wrong
   * one: the reader is about to say what is wrong with the proposal, and they
   * need to be able to see it while they do.
   */
  const refine = React.useCallback(() => {
    setSession({ refining: true, draft: '' });
    inputRef?.current?.focus();
  }, [setSession, inputRef]);

  return {
    kind,
    messages,
    draft,
    send,
    approve,
    refine,
    submitting,
    streamingReply,
    committing,
    isBusy: submitting !== null || committing,
  };
}
