import React from 'react';
import type { TextInput } from 'react-native';

import { useCompassStore } from '@/stores/compass';
import { useCompassChatStore } from '@/stores/compass-chat';
import { useSamwellSessionStore } from '@/stores/samwell-session';

export type CompassConversationKind = 'plan' | 'checkin';

/**
 * The Compass conversation.
 *
 * One conversation now, not two. It used to branch between a plan endpoint and
 * a check-in endpoint, each asking the model for a structured document;
 * Samwell finds out for himself whether a goal exists by calling
 * `get_compass_status`, and reaches for `propose_goal` or `propose_adjustments`
 * when the conversation has produced something worth putting on screen. `kind`
 * survives only so the empty state can say the right thing before anyone has
 * spoken.
 *
 * The transcript is persisted and titled like any other chat, so a
 * conversation can be left and come back to. What Samwell knows about the goal
 * still comes from the logs and the notes through his tools, not from the
 * transcript, so an old conversation reopened today reads today's numbers.
 */
export function useCompassConversation(inputRef?: React.RefObject<TextInput | null>) {
  const draft = useSamwellSessionStore((s) => s.compassDraft);
  const setSession = useSamwellSessionStore((s) => s.set);

  const activeGoalId = useCompassStore((s) => s.activeGoalId);
  const committing = useCompassStore((s) => s.committing);
  const commitProposal = useCompassStore((s) => s.commitProposal);
  const applyCheckinDraft = useCompassStore((s) => s.applyCheckinDraft);

  const messages = useCompassChatStore((s) => s.messages);
  const sessions = useCompassChatStore((s) => s.sessions);
  const activeSessionId = useCompassChatStore((s) => s.activeSessionId);
  const switching = useCompassChatStore((s) => s.switching);
  const submitting = useCompassChatStore((s) => s.submitting);
  const streamingReply = useCompassChatStore((s) => s.streamingReply);
  const streamingThinking = useCompassChatStore((s) => s.streamingThinking);
  const streamingThinkingSeconds = useCompassChatStore((s) => s.streamingThinkingSeconds);
  const lastStreamedMessageId = useCompassChatStore((s) => s.lastStreamedMessageId);
  const toolStatus = useCompassChatStore((s) => s.toolStatus);
  const toolName = useCompassChatStore((s) => s.toolName);
  const send = useCompassChatStore((s) => s.send);
  const stop = useCompassChatStore((s) => s.stop);
  const newSession = useCompassChatStore((s) => s.newSession);
  const openSession = useCompassChatStore((s) => s.openSession);
  const deleteSession = useCompassChatStore((s) => s.deleteSession);

  const kind: CompassConversationKind = activeGoalId ? 'checkin' : 'plan';

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
    sessions,
    activeSessionId,
    switching,
    draft,
    send,
    stop,
    newSession,
    openSession,
    deleteSession,
    approve,
    refine,
    submitting,
    streamingReply,
    streamingThinking,
    streamingThinkingSeconds,
    lastStreamedMessageId,
    toolStatus,
    toolName,
    committing,
    isBusy: submitting || committing,
  };
}
