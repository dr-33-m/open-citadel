/**
 * The Compass side of the Samwell screen, as one hook.
 *
 * Compass is three conversations wearing the same clothes — setting a goal up,
 * a morning plan, a night review — and which one you are in is decided by the
 * clock rather than by anything the user picks. That branch used to be spelled
 * out three times in the screen body: once to pick the opener, once to route
 * the turn to the right store action, once to decide what finalising meant.
 * Three copies of one decision, and the screen carried all of them alongside
 * the chat it has nothing to do with.
 *
 * Everything here is Compass and nothing here is chat, which is the whole
 * point: the screen can now hand this to a body component and forget about it.
 */
import React from 'react';
import type {
  CompassChatMessage,
  CompassMorningAnalysis,
  CompassNightAnalysis,
  CompassSetupProposal,
} from 'samwell-shared';

import { currentCompassDay } from '@/services/compass-day';
import { activeCheckin, addDaysYmd } from '@/services/compass-math';
import { useCompassStore } from '@/stores/compass';
import { useSamwellSessionStore } from '@/stores/samwell-session';
import { useSettingsStore } from '@/stores/settings';

export type CompassFlow = 'setup' | 'morning' | 'night';

/** Which date field a calendar is currently being picked for. */
export type CompassDateTarget = 'milestone' | 'goal';

const OPENER: Record<CompassFlow, string> = {
  setup:
    'Tell me what you want to achieve. It does not have to be about building something; a skill, a habit, a change, anything. We will sharpen it together.',
  morning:
    'Tell me the plan for today. Say it however it comes; we will shape it together before you log it.',
  night:
    'How did today actually run? Tell it straight, including anything that pulled you off course.',
};

export function useCompassFlow() {
  const morningTime = useSettingsStore((s) => s.compassMorningTime);
  const nightTime = useSettingsStore((s) => s.compassNightTime);

  const goal = useCompassStore((s) => s.goal);
  const milestone = useCompassStore((s) => s.milestone);
  const telemetry = useCompassStore((s) => s.telemetry);
  const submitting = useCompassStore((s) => s.submitting);
  const error = useCompassStore((s) => s.error);
  const loadCompass = useCompassStore((s) => s.loadCompass);
  const sendSetupTurn = useCompassStore((s) => s.sendSetupTurn);
  const sendMorningTurn = useCompassStore((s) => s.sendMorningTurn);
  const sendNightTurn = useCompassStore((s) => s.sendNightTurn);
  const finalizeSetup = useCompassStore((s) => s.finalizeSetup);
  const finalizeMorning = useCompassStore((s) => s.finalizeMorning);
  const finalizeNight = useCompassStore((s) => s.finalizeNight);
  const updateTargetDates = useCompassStore((s) => s.updateTargetDates);
  const archiveGoal = useCompassStore((s) => s.archiveGoal);

  const messages = useSamwellSessionStore((s) => s.compassMessages);
  const draft = useSamwellSessionStore((s) => s.compassDraft);
  const open = useSamwellSessionStore((s) => s.compassOpen);
  const peek = useSamwellSessionStore((s) => s.compassPeek);
  const committingProposal = useSamwellSessionStore((s) => s.committingProposal);
  const milestoneDate = useSamwellSessionStore((s) => s.milestoneDate);
  const goalDate = useSamwellSessionStore((s) => s.goalDate);
  const setSession = useSamwellSessionStore((s) => s.set);
  const resetCompass = useSamwellSessionStore((s) => s.resetCompass);

  const [finalizing, setFinalizing] = React.useState(false);
  const [calendarFor, setCalendarFor] = React.useState<CompassDateTarget | null>(null);
  const [editingDate, setEditingDate] = React.useState<CompassDateTarget | null>(null);

  // No goal yet means there is nothing to check in against, so setup wins
  // regardless of the hour.
  const flow: CompassFlow = !goal ? 'setup' : activeCheckin(new Date(), morningTime, nightTime);

  const busy = submitting === flow || finalizing;

  /** Routes one turn to the store action for the flow we are actually in. */
  const runTurn = React.useCallback(
    async (msgs: CompassChatMessage[]) => {
      const send =
        flow === 'setup' ? sendSetupTurn : flow === 'morning' ? sendMorningTurn : sendNightTurn;
      const turn = await send(msgs);
      if (!turn) return;
      setSession({
        compassMessages: [...msgs, { role: 'assistant', content: turn.reply }],
        compassDraft: turn.draft,
      });
    },
    [flow, sendSetupTurn, sendMorningTurn, sendNightTurn, setSession],
  );

  const send = React.useCallback(
    async (text: string) => {
      const next: CompassChatMessage[] = [...messages, { role: 'user', content: text }];
      // Sending opens the conversation over the Compass timeline; the calendar
      // button in the control center peeks back at it without closing this.
      setSession({ compassMessages: next, compassDraft: null, compassOpen: true });
      await runTurn(next);
    },
    [messages, setSession, runTurn],
  );

  const finalizeCheckin = React.useCallback(async () => {
    if (!draft) return;
    const transcript = messages
      .map((m) => `${m.role === 'user' ? 'Me' : 'Samwell'}: ${m.content}`)
      .join('\n\n');
    setFinalizing(true);
    let ok = false;
    if (flow === 'morning') {
      ok = await finalizeMorning({ analysis: draft as CompassMorningAnalysis, transcript });
    } else if (flow === 'night') {
      ok = await finalizeNight({ analysis: draft as CompassNightAnalysis, transcript });
    }
    setFinalizing(false);
    if (ok) resetCompass();
  }, [draft, messages, flow, finalizeMorning, finalizeNight, resetCompass]);

  /**
   * Setup does not commit on approval — it moves to a commit card where the
   * dates get picked. The check-ins have nothing left to decide, so they
   * finalise straight away.
   */
  const approveDraft = React.useCallback(() => {
    if (!draft) return;
    if (flow !== 'setup') {
      void finalizeCheckin();
      return;
    }
    const proposal = draft as CompassSetupProposal;
    const today = currentCompassDay();
    setSession({
      committingProposal: proposal,
      milestoneDate: addDaysYmd(today, proposal.milestoneDurationDays),
      ...(!goal && proposal.goalDurationDays
        ? { goalDate: addDaysYmd(today, proposal.goalDurationDays) }
        : {}),
    });
  }, [draft, flow, goal, setSession, finalizeCheckin]);

  const confirmSetup = React.useCallback(async () => {
    if (!committingProposal || !milestoneDate) return;
    // A first goal needs its own target date, not just the milestone's.
    if (!goal && !goalDate) {
      setCalendarFor('goal');
      return;
    }
    setFinalizing(true);
    const ok = await finalizeSetup({
      proposal: committingProposal,
      milestoneTargetDate: milestoneDate,
      goalTargetDate: goalDate,
    });
    setFinalizing(false);
    if (ok) resetCompass();
  }, [committingProposal, milestoneDate, goal, goalDate, finalizeSetup, resetCompass]);

  const placeholder =
    !goal ? 'I want to…' : flow === 'morning' ? 'Today I want to…' : 'Today I actually…';

  return {
    flow,
    opener: OPENER[flow],
    placeholder,
    busy,
    finalizing,
    submitting,
    error,
    goal,
    milestone,
    telemetry,
    messages,
    draft,
    open,
    peek,
    committingProposal,
    milestoneDate,
    goalDate,
    loadCompass,
    send,
    approveDraft,
    confirmSetup,
    updateTargetDates,
    archiveGoal,
    setSession,
    calendarFor,
    setCalendarFor,
    editingDate,
    setEditingDate,
  };
}

export type CompassFlowState = ReturnType<typeof useCompassFlow>;
