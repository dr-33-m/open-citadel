import {
  normalizeCheckinDraft,
  normalizeGoalProposal,
  type CompassCheckinDraftModel,
  type GoalProposalModel,
} from 'samwell-shared';

import {
  leanSignal,
  trackableConsistency,
} from '@/services/consistency';
import { isLogSatisfying, measurementLabel } from '@/services/measurement';
import {
  byTrackableTime,
  dueOn,
  scheduleSummary,
  type LogView,
  type TrackableView,
} from '@/services/occurrences';
import { readGoals, useCompassStore, type GoalRow } from '@/stores/compass';
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
  const { activeGoals, primaryGoalId, dataByGoal, trackables, logsByTrackable } =
    useCompassStore.getState();
  // The primary, or the first active goal when nothing holds the mark. There
  // is no "goal on screen" any more, and the primary is the one Compass says
  // the prize is on.
  const goal = activeGoals.find((g) => g.id === primaryGoalId) ?? activeGoals[0];
  if (!goal) return null;
  const data = dataByGoal.get(goal.id);
  return {
    goal,
    trackables: data?.views ?? trackables,
    logsByTrackable: data?.logsByTrackable ?? logsByTrackable,
    today: localDayString(),
  };
}

/**
 * One goal with the data its detail block is written from.
 *
 * The viewed goal's views are already held by the store; the primary, when it
 * is a different goal, is read on demand.
 */
type GoalDetail = {
  goal: GoalRow;
  trackables: TrackableView[];
  logsByTrackable: Map<string, LogView[]>;
};

function detailFor(
  goalId: string,
  store: ReturnType<typeof useCompassStore.getState>,
  today: Ymd,
): GoalDetail | null {
  const goal = store.goals.find((g) => g.id === goalId);
  if (!goal) return null;
  // Every active goal's data is already in the store, so a detail block for
  // any of them costs no query. Only a goal that is no longer active falls
  // through to a read.
  const held = store.dataByGoal.get(goalId);
  if (held) {
    return { goal, trackables: held.views, logsByTrackable: held.logsByTrackable };
  }
  const data = readGoals([goalId]).get(goalId);
  return data ? { goal, trackables: data.views, logsByTrackable: data.logsByTrackable } : null;
}

/**
 * The goal a trackable id belongs to, searched across every active goal.
 *
 * get_compass_status lists ids from the primary and the viewed goal, and the
 * primary may not be the one on screen, so the write and history tools have to
 * resolve the same way or the ids they advertise would not work. The common
 * case — the viewed goal — is already in the store and costs no query; the
 * rest fall back to one read over the active set.
 */
function trackableContext(trackableId: string): (GoalDetail & { trackable: TrackableView }) | null {
  const store = useCompassStore.getState();

  const held = store.trackables.find((t) => t.id === trackableId);
  if (held) {
    const goal = store.goals.find((g) => g.id === held.goalId);
    if (goal) {
      return {
        goal,
        trackable: held,
        trackables: store.trackables,
        logsByTrackable: store.logsByTrackable,
      };
    }
  }

  const data = readGoals(store.activeGoals.map((g) => g.id));
  for (const goal of store.activeGoals) {
    const views = data.get(goal.id)?.views ?? [];
    const trackable = views.find((t) => t.id === trackableId);
    if (trackable) {
      return {
        goal,
        trackable,
        trackables: views,
        logsByTrackable: data.get(goal.id)?.logsByTrackable ?? new Map(),
      };
    }
  }
  return null;
}

// ── get_compass_status ──────────────────────────────────────────────────────

/**
 * The trackable rows for one goal's detail block: schedule, measurement, the
 * per-trackable consistency, and the weakest link marked. The per-trackable
 * ratio is always included now that the goal's own CONSISTENCY line sits in the
 * summary above — the row is the only place that connects an id to a number,
 * and the model may only quote numbers the tool gave it.
 */
function trackableLines(detail: GoalDetail, today: Ymd): string[] {
  const range = goalWindowTo(detail.goal, today);
  const results = detail.trackables.map((trackable) =>
    trackableConsistency({
      trackable,
      logs: detail.logsByTrackable.get(trackable.id) ?? [],
      range,
      today,
    }),
  );
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

  const lines: string[] = [];
  for (const trackable of detail.trackables) {
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
    if (result && result.bonus > 0) {
      parts.push(`${result.bonus} extra beyond what was asked`);
    }
    if (weakest && weakest.trackableId === trackable.id) parts.push('WEAKEST');
    lines.push(parts.join(' — '));
  }
  return lines;
}

export function formatCompassStatus(): string {
  const store = useCompassStore.getState();
  const { activeGoals, primaryGoalId, consistencyByGoal } = store;
  if (activeGoals.length === 0) return NO_GOAL;

  const today = localDayString();

  /*
   * One summary line per active goal. The numbers come from
   * `consistencyByGoal`, which the store recomputed on its last write, so the
   * summary costs no queries however many goals are running.
   */
  const lines = [
    `GOALS (${activeGoals.length} ACTIVE. The PRIMARY goal is where the main prize is.)`,
  ];
  for (const goal of activeGoals) {
    const consistency = consistencyByGoal.get(goal.id);
    const execution = consistency
      ? `${percent(consistency.execution.ratio)} (${consistency.execution.completed} of ${consistency.execution.expected} expected)`
      : 'not yet measurable';
    const outcome = consistency?.outcome
      ? `${consistency.outcome.value} of ${consistency.outcome.target} ${consistency.outcome.unit}`
      : 'no numeric outcome';
    const marks = goal.id === primaryGoalId ? 'PRIMARY' : '';
    lines.push(
      `- ${goal.title}${marks ? ` [${marks}]` : ''} — ${goal.category} — CONSISTENCY ${execution} — OUTCOME ${outcome}`,
    );
  }

  /*
   * Full detail on EVERY active goal, primary first.
   *
   * It used to be the primary plus whichever goal was on screen, because the
   * app pointed at one goal at a time and that was the one you could act on.
   * Nothing points at a goal any more, so limiting the detail would leave the
   * trackable ids of the other goals unadvertised — and those ids are how a
   * log gets written. The set is capped at five, so this stays bounded.
   */
  const detailIds = [
    ...new Set([primaryGoalId, ...activeGoals.map((g) => g.id)].filter(
      (id): id is string => id != null,
    )),
  ];
  const details = detailIds
    .map((id) => detailFor(id, store, today))
    .filter((detail): detail is GoalDetail => detail !== null);

  if (details.length > 0) {
    lines.push('', 'DETAIL (use the trackable id in square brackets when you call a tool):');
    for (const detail of details) {
      const marks = detail.goal.id === primaryGoalId ? 'PRIMARY' : '';
      lines.push(
        '',
        `${detail.goal.title}${marks ? ` [${marks}]` : ''} — runs ${detail.goal.startDate} to ${detail.goal.endDate}. ${Math.max(0, daysBetween(today, detail.goal.endDate))} days left. Status ${detail.goal.status}.`,
      );
      if (detail.goal.description) lines.push(detail.goal.description);
      lines.push(...trackableLines(detail, today));
    }
  }

  const paused = details.flatMap((detail) =>
    detail.trackables
      .filter((t) => t.pauses.some((p) => p.endDate === null))
      .map((t) => `${t.title} (${detail.goal.title})`),
  );
  if (paused.length > 0) {
    lines.push(
      '',
      `PAUSED RIGHT NOW: ${paused.join(', ')}. Paused days expect nothing and are not counted against them.`,
    );
  }

  /*
   * The lean signal: the primary being out-executed by the best side goal.
   * Computed by the same engine the overview sheet nudges from, so the two
   * cannot disagree about when the primary is trailing.
   */
  const primary = activeGoals.find((g) => g.id === primaryGoalId);
  if (primary) {
    const lean = leanSignal(
      consistencyByGoal.get(primary.id)?.execution ?? null,
      activeGoals
        .filter((g) => g.id !== primary.id)
        .map((g) => ({ id: g.id, execution: consistencyByGoal.get(g.id)?.execution ?? null })),
    );
    const leader = lean ? activeGoals.find((g) => g.id === lean.leaderId) : null;
    if (lean && leader) {
      lines.push(
        '',
        `LEAN: "${leader.title}" is executing at ${percent(lean.leaderRatio)} while the primary goal "${primary.title}" sits at ${percent(lean.primaryRatio)}. Name the primary goal's prize and steer back to it.`,
      );
    }
  }

  return lines.join('\n');
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
  const context = trackableContext(trackableId);
  if (!context) {
    return `There is no trackable with id ${trackableId}. Call get_compass_status for the real ids.`;
  }

  const { goal, trackable, logsByTrackable } = context;
  const today = localDayString();
  const span = days ?? DEFAULT_HISTORY_DAYS;
  const from = maxYmd(addDaysYmd(today, -span), trackable.startDate);
  const to = minYmd(today, trackable.endDate);
  const logs = (logsByTrackable.get(trackableId) ?? [])
    .filter((log) => log.date >= from && log.date <= to)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, MAX_HISTORY_LOGS);

  const result = trackableConsistency({
    trackable,
    logs: logsByTrackable.get(trackableId) ?? [],
    range: { from, to },
    today,
  });

  const lines = [
    `${trackable.title} (goal: ${goal.title}) — ${scheduleSummary(trackable.schedule)} — measured by ${trackable.measurement.type}`,
    `Last ${span} days (${from} to ${to}): ${result.completed} of ${result.expected} (${percent(result.ratio)}).`,
  ];

  if (result.missed.length > 0) {
    lines.push(`MISSED DAYS: ${result.missed.slice(-15).join(', ')}.`);
  }

  const pauses = trackable.pauses.filter((p) => (p.endDate ?? today) >= from);
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
  const context = trackableContext(input.trackable_id);
  if (!context) {
    return {
      ok: false,
      formatted: `There is no trackable with id ${input.trackable_id}. Call get_today or get_compass_status for the real ids.`,
    };
  }

  const trackable = context.trackable;
  const today = localDayString();

  /*
   * A day that has not happened cannot be logged. The prompt says so, but a
   * model that miscounts a date would otherwise write a completion into the
   * future, where it silently satisfies a day the user has not lived yet.
   */
  const date = input.date && input.date <= today ? input.date : today;
  if (date < trackable.startDate || date > trackable.endDate) {
    return {
      ok: false,
      formatted: `${date} is outside this trackable's window (${trackable.startDate} to ${trackable.endDate}), so nothing was logged.`,
    };
  }

  const already = (context.logsByTrackable.get(trackable.id) ?? []).find(
    (l) => l.date === date,
  );
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
  const store = useCompassStore.getState();
  if (store.activeGoals.length === 0) return { ok: false, formatted: NO_GOAL };

  /*
   * Adjustments may target any active goal's trackables — the same set
   * get_compass_status draws its ids from, not only the goal on screen.
   */
  const data = readGoals(store.activeGoals.map((g) => g.id));
  const knownIds = [...data.values()].flatMap((goalData) =>
    goalData.views.map((t) => t.id),
  );

  const draft = normalizeCheckinDraft(input, knownIds);
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

// ── The goal's life ─────────────────────────────────────────────────────────

/**
 * Ending, re-pointing and pausing, from a conversation.
 *
 * Every one of these reaches the same store action the sheet's button does, so
 * there is one implementation of what finishing a goal means and Samwell
 * cannot take a shortcut the UI would not.
 *
 * They all return prose rather than a status object. A tool result is read by
 * the model before it writes its reply, and a sentence it can quote produces a
 * better next turn than `{ ok: true }` does.
 */

function goalById(goalId: string) {
  return useCompassStore.getState().goals.find((g) => g.id === goalId) ?? null;
}

export async function runFinishGoal(input: { goal_id: string }) {
  const goal = goalById(input.goal_id);
  if (!goal) {
    return {
      ok: false,
      formatted: `There is no goal with id ${input.goal_id}. Call get_compass_status for the real ids.`,
    };
  }
  if (goal.status !== 'ACTIVE') {
    return { ok: false, formatted: `"${goal.title}" has already ended.` };
  }

  /*
   * The same lock the button has: the end date, OR the number being reached.
   * Repeated here rather than trusted to the prompt, because a model that
   * finishes a habit on its third good day hands the user permission to stop
   * as the reward for having started — which is the exact failure Compass is
   * built against.
   */
  const consistency = useCompassStore.getState().consistencyByGoal.get(goal.id) ?? null;
  const outcome = consistency?.outcome ?? null;
  const reachedTarget = outcome != null && outcome.target > 0 && outcome.value >= outcome.target;
  const runEnded = localDayString() >= goal.endDate;
  if (!runEnded && !reachedTarget) {
    return {
      ok: false,
      formatted: `"${goal.title}" cannot be finished yet. It runs to ${goal.endDate}, and it unlocks then or as soon as it reaches its number. Tell the user that rather than trying again.`,
    };
  }

  await useCompassStore.getState().finishGoal(goal.id);
  return { ok: true, formatted: `Closed out "${goal.title}" as finished.` };
}

export async function runStopGoal(input: { goal_id: string; reason: string }) {
  const goal = goalById(input.goal_id);
  if (!goal) {
    return {
      ok: false,
      formatted: `There is no goal with id ${input.goal_id}. Call get_compass_status for the real ids.`,
    };
  }
  if (goal.status !== 'ACTIVE') {
    return { ok: false, formatted: `"${goal.title}" has already ended.` };
  }

  const reason = input.reason?.trim();
  if (!reason) {
    return {
      ok: false,
      formatted:
        'Stopping a goal needs a reason in the user\'s own words. Ask them why before calling this again.',
    };
  }

  await useCompassStore.getState().abandonGoal(goal.id, reason);
  return { ok: true, formatted: `Stopped "${goal.title}" before the end, and kept their reason.` };
}

export async function runSetPrimaryGoal(input: { goal_id: string }) {
  const goal = goalById(input.goal_id);
  if (!goal) {
    return {
      ok: false,
      formatted: `There is no goal with id ${input.goal_id}. Call get_compass_status for the real ids.`,
    };
  }
  if (goal.status !== 'ACTIVE') {
    return { ok: false, formatted: `"${goal.title}" has ended, so it cannot be the main goal.` };
  }
  if (useCompassStore.getState().primaryGoalId === goal.id) {
    return { ok: true, formatted: `"${goal.title}" is already the main goal.` };
  }

  await useCompassStore.getState().setPrimaryGoal(goal.id);
  return { ok: true, formatted: `"${goal.title}" is now the main goal.` };
}

function trackableById(trackableId: string) {
  return useCompassStore.getState().trackables.find((t) => t.id === trackableId) ?? null;
}

export async function runPauseTrackable(input: { trackable_id: string }) {
  const trackable = trackableById(input.trackable_id);
  if (!trackable) {
    return {
      ok: false,
      formatted: `There is no activity with id ${input.trackable_id}. Call get_compass_status for the real ids.`,
    };
  }
  if (trackable.status === 'PAUSED') {
    return { ok: true, formatted: `${trackable.title} is already paused.` };
  }

  await useCompassStore.getState().pauseTrackable(trackable.id);
  return {
    ok: true,
    formatted: `Paused ${trackable.title}. The days it stays paused will not count against consistency.`,
  };
}

export async function runResumeTrackable(input: { trackable_id: string }) {
  const trackable = trackableById(input.trackable_id);
  if (!trackable) {
    return {
      ok: false,
      formatted: `There is no activity with id ${input.trackable_id}. Call get_compass_status for the real ids.`,
    };
  }
  if (trackable.status !== 'PAUSED') {
    return { ok: true, formatted: `${trackable.title} is already running.` };
  }

  await useCompassStore.getState().resumeTrackable(trackable.id);
  return { ok: true, formatted: `${trackable.title} is running again from today.` };
}
