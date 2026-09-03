import {
  normalizeCheckinDraft,
  normalizeGoalProposal,
  type CompassCheckinDraftModel,
  type GoalProposalModel,
} from 'samwell-shared';

import {
  goalExecution,
  goalOutcome,
  trackableConsistency,
  type ConsistencyResult,
} from '@/services/consistency';
import { isLogSatisfying, measurementLabel } from '@/services/measurement';
import {
  byTrackableTime,
  dueOn,
  scheduleSummary,
  type LogView,
  type TrackableView,
} from '@/services/occurrences';
import { useCompassStore, type GoalRow } from '@/stores/compass';
import { useSamwellSessionStore } from '@/stores/samwell-session';
import {
  addDaysYmd,
  daysBetween,
  deviceTimezone,
  localDayString,
  maxYmd,
  minYmd,
  type Ymd,
} from '@/utils/day';

/**
 * Compass's tools, executed on the device.
 *
 * Everything Compass knows lives in the local database: the goal, the
 * schedules, every log and every note the user has written. None of it goes to
 * the server as a context blob any more. Samwell asks for what he needs when
 * he needs it, the same way he already does with the library, which is why he
 * can now answer "what does this number mean" instead of only being handed a
 * snapshot chosen for him before the conversation started.
 *
 * Every number here is computed by the same engines the screens use. A ratio
 * the model works out for itself is a number about someone's discipline that
 * nobody checked, so the tools hand it finished prose and the prompt forbids
 * arithmetic.
 */

/** Nothing to report, phrased so the model does not invent a goal. */
const NO_GOAL =
  'The user has no active goal yet. Nothing is being tracked. This is a conversation about setting one up.';

function percent(ratio: number | null): string {
  return ratio == null ? 'not yet measurable' : `${Math.round(ratio * 100)}%`;
}

/** The part of the goal's span that has actually happened, for consistency. */
function goalWindowTo(goal: GoalRow, today: Ymd): { from: Ymd; to: Ymd } {
  return { from: goal.startDate, to: minYmd(goal.endDate, today) };
}

type ActiveGoal = {
  goal: GoalRow;
  trackables: TrackableView[];
  logsByTrackable: Map<string, LogView[]>;
  today: Ymd;
};

function activeGoal(): ActiveGoal | null {
  const { goals, activeGoalId, trackables, logsByTrackable } = useCompassStore.getState();
  const goal = goals.find((g) => g.id === activeGoalId);
  if (!goal) return null;
  return { goal, trackables, logsByTrackable, today: localDayString() };
}

function consistencyFor(active: ActiveGoal): ConsistencyResult[] {
  const range = goalWindowTo(active.goal, active.today);
  return active.trackables.map((trackable) =>
    trackableConsistency({
      trackable,
      logs: active.logsByTrackable.get(trackable.id) ?? [],
      range,
      today: active.today,
    }),
  );
}

// ── get_compass_status ──────────────────────────────────────────────────────

export function formatCompassStatus(): string {
  const active = activeGoal();
  if (!active) return NO_GOAL;

  const { goal, trackables, logsByTrackable, today } = active;
  const results = consistencyFor(active);
  const execution = goalExecution(results);
  const outcome = goalOutcome(goal, trackables, logsByTrackable);
  const byId = new Map(results.map((r) => [r.trackableId, r]));

  /*
   * Named rather than left for the model to work out, because "which one is
   * hurting" is the question every progress conversation turns on and picking
   * it out of five ratios is exactly the arithmetic the prompt forbids. Only
   * meaningful once something has been expected, so an unmeasured trackable
   * cannot be called the weak one on day one.
   */
  const measured = results.filter((r) => r.ratio != null && r.expected > 0);
  const weakest =
    measured.length > 1
      ? measured.reduce((worst, r) => ((r.ratio ?? 1) < (worst.ratio ?? 1) ? r : worst))
      : null;

  const lines = [
    `GOAL: ${goal.title}`,
    goal.description ? goal.description : null,
    `Runs ${goal.startDate} to ${goal.endDate}. ${Math.max(0, daysBetween(today, goal.endDate))} days left. Status ${goal.status}.`,
    `EXECUTION: ${percent(execution.ratio)} (${execution.completed} of ${execution.expected} expected). This is how consistently they showed up.`,
    outcome
      ? `OUTCOME: ${outcome.value} of ${outcome.target} ${outcome.unit}. This is a different fact from execution.`
      : 'OUTCOME: this goal has no numeric target, so consistency is the whole measure.',
    '',
    'TRACKABLES (use the id in square brackets when you call a tool):',
  ];

  for (const trackable of trackables) {
    const result = byId.get(trackable.id);
    const unit = measurementLabel(trackable.measurement);
    const parts = [
      `[${trackable.id}] ${trackable.title}`,
      scheduleSummary(trackable.schedule),
      `measured by ${trackable.measurement.type}${unit ? ` in ${unit}` : ''}`,
      result
        ? `${result.completed} of ${result.expected} (${percent(result.ratio)})`
        : 'nothing expected yet',
    ];
    if (trackable.status !== 'ACTIVE') parts.push(trackable.status);
    if (result && result.bonus > 0) parts.push(`${result.bonus} extra beyond what was asked`);
    if (weakest && weakest.trackableId === trackable.id) parts.push('WEAKEST');
    lines.push(parts.join(' — '));
  }

  const paused = trackables.filter((t) => t.pauses.some((p) => p.endDate === null));
  if (paused.length > 0) {
    lines.push(
      '',
      `PAUSED RIGHT NOW: ${paused.map((t) => t.title).join(', ')}. Paused days expect nothing and are not counted against them.`,
    );
  }

  return lines.filter((line) => line !== null).join('\n');
}

// ── get_today ───────────────────────────────────────────────────────────────

export function formatToday(): string {
  const active = activeGoal();
  if (!active) return NO_GOAL;

  const { trackables, logsByTrackable, today } = active;
  const open = dueOn(today, trackables, logsByTrackable);

  const loggedToday = trackables
    .map((trackable) => {
      const log = (logsByTrackable.get(trackable.id) ?? []).find((l) => l.date === today);
      return log ? { trackable, log } : null;
    })
    .filter((entry): entry is { trackable: TrackableView; log: LogView } => entry !== null)
    // Same clock order the deck and the planner's day list read in, so the
    // three surfaces never disagree about what "today" looks like.
    .sort((a, b) => byTrackableTime(a.trackable, b.trackable));

  const lines = [`TODAY IS ${today}.`];

  if (open.length === 0) {
    lines.push('NOTHING IS STILL OPEN TODAY.');
  } else {
    lines.push('', 'STILL OPEN TODAY (ask about these, and log what they tell you):');
    for (const item of open) {
      const unit = measurementLabel(item.trackable.measurement);
      const parts = [
        `[${item.trackable.id}] ${item.trackable.title}`,
        item.trackable.timeOfDay ?? 'no set time',
        `measured by ${item.trackable.measurement.type}${unit ? ` in ${unit}` : ''}`,
      ];
      if (item.periodLabel) parts.push(item.periodLabel);
      lines.push(parts.join(' — '));
    }
  }

  if (loggedToday.length > 0) {
    lines.push('', 'ALREADY LOGGED TODAY (do not ask about these again):');
    for (const { trackable, log } of loggedToday) {
      const outcome = log.completed === 0 ? 'did not happen' : 'done';
      const value = log.value != null ? `, ${log.value}` : '';
      const note = log.note ? ` — they wrote: "${log.note}"` : '';
      lines.push(`[${trackable.id}] ${trackable.title} — ${outcome}${value}${note}`);
    }
  }

  return lines.join('\n');
}

// ── get_trackable_history ───────────────────────────────────────────────────

const DEFAULT_HISTORY_DAYS = 28;
const MAX_HISTORY_LOGS = 40;

export function formatTrackableHistory(trackableId: string, days: number | null): string {
  const active = activeGoal();
  if (!active) return NO_GOAL;

  const trackable = active.trackables.find((t) => t.id === trackableId);
  if (!trackable) {
    return `There is no trackable with id ${trackableId}. Call get_compass_status for the real ids.`;
  }

  const span = days ?? DEFAULT_HISTORY_DAYS;
  const from = maxYmd(addDaysYmd(active.today, -span), trackable.startDate);
  const to = minYmd(active.today, trackable.endDate);
  const logs = (active.logsByTrackable.get(trackableId) ?? [])
    .filter((log) => log.date >= from && log.date <= to)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, MAX_HISTORY_LOGS);

  const result = trackableConsistency({
    trackable,
    logs: active.logsByTrackable.get(trackableId) ?? [],
    range: { from, to },
    today: active.today,
  });

  const lines = [
    `${trackable.title} — ${scheduleSummary(trackable.schedule)} — measured by ${trackable.measurement.type}`,
    `Last ${span} days (${from} to ${to}): ${result.completed} of ${result.expected} (${percent(result.ratio)}).`,
  ];

  if (result.missed.length > 0) {
    lines.push(`MISSED DAYS: ${result.missed.slice(-15).join(', ')}.`);
  }

  const pauses = trackable.pauses.filter((p) => (p.endDate ?? active.today) >= from);
  if (pauses.length > 0) {
    lines.push(
      `PAUSED: ${pauses
        .map((p) => `${p.startDate} to ${p.endDate ?? 'still paused'}`)
        .join('; ')}. These days were not counted against them.`,
    );
  }

  if (logs.length === 0) {
    lines.push('No logs in this window.');
    return lines.join('\n');
  }

  lines.push('', 'LOGS, newest first. The notes are the real material here:');
  for (const log of logs) {
    const outcome =
      log.completed === 0
        ? 'did not happen'
        : isLogSatisfying(log, trackable.measurement)
          ? 'done'
          : 'short of target';
    const value = log.value != null ? `, ${log.value}` : '';
    const note = log.note ? ` — "${log.note}"` : '';
    lines.push(`${log.date} — ${outcome}${value}${note}`);
  }

  return lines.join('\n');
}

// ── log_trackable ───────────────────────────────────────────────────────────

export type LogTrackableInput = {
  trackable_id: string;
  outcome: 'DONE' | 'MISSED';
  value: number | null;
  note: string | null;
  date: string | null;
};

export async function runLogTrackable(
  input: LogTrackableInput,
): Promise<{ ok: boolean; formatted: string }> {
  const active = activeGoal();
  if (!active) return { ok: false, formatted: NO_GOAL };

  const trackable = active.trackables.find((t) => t.id === input.trackable_id);
  if (!trackable) {
    return {
      ok: false,
      formatted: `There is no trackable with id ${input.trackable_id}. Call get_today or get_compass_status for the real ids.`,
    };
  }

  /*
   * A day that has not happened cannot be logged. The prompt says so, but a
   * model that miscounts a date would otherwise write a completion into the
   * future, where it silently satisfies a day the user has not lived yet.
   */
  const date = input.date && input.date <= active.today ? input.date : active.today;
  if (date < trackable.startDate || date > trackable.endDate) {
    return {
      ok: false,
      formatted: `${date} is outside this trackable's window (${trackable.startDate} to ${trackable.endDate}), so nothing was logged.`,
    };
  }

  const already = (active.logsByTrackable.get(trackable.id) ?? []).find((l) => l.date === date);
  if (already) {
    return {
      ok: false,
      formatted: `${trackable.title} was already logged on ${date}. Tell the user it is already recorded rather than logging it twice; they can change it from the log deck.`,
    };
  }

  const store = useCompassStore.getState();
  if (input.outcome === 'MISSED') {
    await store.logMissed(trackable.id, input.note, date);
    return {
      ok: true,
      formatted: `Logged: ${trackable.title} did not happen on ${date}${
        input.note ? `, noted "${input.note}"` : ''
      }. An explained miss still counts as a miss.`,
    };
  }

  await store.logDone(trackable.id, input.value, input.note, date);
  return {
    ok: true,
    formatted: `Logged: ${trackable.title} done on ${date}${
      input.value != null ? `, ${input.value}` : ''
    }${input.note ? `, noted "${input.note}"` : ''}.`,
  };
}

// ── propose_goal / propose_adjustments ──────────────────────────────────────

/**
 * A proposal is not a write.
 *
 * It puts a card on screen and stops. Nothing reaches the database until the
 * user presses approve, which is why these two are not in the approval set:
 * the card is the approval, and a confirmation dialog in front of it would ask
 * the same question twice.
 */
export function runProposeGoal(input: GoalProposalModel): { ok: boolean; formatted: string } {
  try {
    const proposal = normalizeGoalProposal(input, {
      today: localDayString(),
      timezone: deviceTimezone(),
    });
    useSamwellSessionStore.getState().set({
      compassDraft: { kind: 'plan', proposal },
      refining: false,
    });
    return {
      ok: true,
      formatted: `The proposal for "${proposal.title}" with ${proposal.trackables.length} trackable(s) is on screen. The user can approve it, ask you to change it, or reject it. Say something short; do not repeat the card back to them.`,
    };
  } catch (err) {
    return {
      ok: false,
      formatted: `That proposal could not be built: ${
        err instanceof Error ? err.message : 'invalid proposal'
      }. Fix it and propose again.`,
    };
  }
}

export function runProposeAdjustments(input: CompassCheckinDraftModel): {
  ok: boolean;
  formatted: string;
} {
  const active = activeGoal();
  if (!active) return { ok: false, formatted: NO_GOAL };

  const draft = normalizeCheckinDraft(
    input,
    active.trackables.map((t) => t.id),
  );
  if (!draft) {
    return {
      ok: false,
      formatted:
        'Nothing in that proposal survived: every adjustment named a trackable that does not exist, and there was no note. Call get_compass_status for the real ids.',
    };
  }

  useSamwellSessionStore.getState().set({ compassDraft: { kind: 'checkin', draft }, refining: false });
  return {
    ok: true,
    formatted: `${draft.adjustments.length} adjustment(s) are on screen for the user to approve. Say something short; do not repeat the card back to them.`,
  };
}
