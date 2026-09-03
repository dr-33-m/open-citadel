import { desc, eq, inArray } from 'drizzle-orm';
import { create } from 'zustand';
import {
  MeasurementSchema,
  ScheduleSchema,
  type Adjustment,
  type GoalProposal,
  type Measurement,
  type Schedule,
} from 'samwell-shared';

import { db } from '@/db/client';
import { goals, trackableLogs, trackablePauses, trackables } from '@/db/schema';
import {
  goalExecution,
  goalOutcome,
  trackableConsistency,
  type ConsistencyResult,
  type GoalExecution,
  type GoalOutcome,
} from '@/services/consistency';
import { saveJourneyReflection } from '@/services/journey';
import {
  byTimeThenTitle,
  dueOn,
  type DueItem,
  type LogView,
  type PauseWindow,
  type TrackableView,
} from '@/services/occurrences';
import { addDaysYmd, localDayString, minYmd, type Ymd } from '@/utils/day';

/** Compass tracks at most this many goals at once. The overview radar reads
 *  as a shape at 3–5 axes and stops reading past that; more than five running
 *  goals is also more than anyone keeps up with. Enforced at creation. */
export const MAX_ACTIVE_GOALS = 5;

export type GoalRow = typeof goals.$inferSelect;

export type GoalConsistency = {
  execution: GoalExecution;
  outcome: GoalOutcome | null;
};

type CompassState = {
  goals: GoalRow[];
  /**
   * The goals with `status === 'ACTIVE'`, primary first then newest — capped
   * at {@link MAX_ACTIVE_GOALS}. This is the set the switcher lists, the deck
   * merges over, and the overview charts.
   */
  activeGoals: GoalRow[];
  activeGoalId: string | null;
  /** The one active goal marked `isPrimary`, or null when none is. */
  primaryGoalId: string | null;
  /** Trackables of the active goal, with their JSON columns already parsed. */
  trackables: TrackableView[];
  logsByTrackable: Map<string, LogView[]>;

  /**
   * Derived data, held as STORED fields and recomputed on every write.
   *
   * Not computed inside a selector. Under zustand v5 a selector that builds a
   * new array or object returns a fresh reference on every store change, so
   * every subscriber re-renders on every keystroke of a streaming reply. The
   * old store made the same call with `telemetry`, and for the same reason.
   */
  /**
   * Everything due today across every active goal, one list, time-ordered.
   * Each `DueItem` carries its `trackable.goalId`, so the deck can label the
   * card with its goal.
   */
  due: DueItem[];
  /** Consistency + outcome for the active goal — the per-goal Insights view. */
  consistency: GoalConsistency | null;
  /** The same, per active goal, for the overview. Keyed by goal id. */
  consistencyByGoal: Map<string, GoalConsistency>;

  isLoaded: boolean;
  committing: boolean;
  error: string | null;

  loadCompass: () => Promise<void>;
  selectGoal: (goalId: string) => Promise<void>;
  /** Move the primary mark to `goalId` (clearing it from wherever it was).
   *  A no-op if that goal is already primary. */
  setPrimaryGoal: (goalId: string) => Promise<void>;

  commitProposal: (proposal: GoalProposal) => Promise<string | null>;
  applyCheckinDraft: (draft: {
    journeyNote: string | null;
    adjustments: Adjustment[];
  }) => Promise<void>;

  logDone: (
    trackableId: string,
    value: number | null,
    note: string | null,
    date?: Ymd,
  ) => Promise<void>;
  logMissed: (trackableId: string, note: string | null, date?: Ymd) => Promise<void>;
  undoLastLog: () => Promise<void>;

  pauseTrackable: (trackableId: string) => Promise<void>;
  resumeTrackable: (trackableId: string) => Promise<void>;
  completeGoal: (goalId: string) => Promise<void>;
  cancelGoal: (goalId: string) => Promise<void>;

  clearError: () => void;
};

function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function friendlyError(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong. Try again.';
}


/**
 * Parse a JSON column, or give up on this one row.
 *
 * Returning null rather than throwing is deliberate: one corrupt schedule
 * should cost the user that trackable, not the whole deck.
 */
function parseSchedule(raw: string): Schedule | null {
  try {
    const parsed = ScheduleSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function parseMeasurement(raw: string): Measurement | null {
  try {
    const parsed = MeasurementSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The window consistency is measured over: the goal so far, never the future. */
function goalWindow(goal: GoalRow, today: string) {
  return { from: goal.startDate, to: minYmd(today, goal.endDate) };
}

/** One goal's consistency + outcome. */
function goalConsistency(
  goal: GoalRow,
  views: TrackableView[],
  logsByTrackable: Map<string, LogView[]>,
  today: string,
): GoalConsistency {
  const range = goalWindow(goal, today);
  const results: ConsistencyResult[] = views.map((trackable) =>
    trackableConsistency({
      trackable,
      logs: logsByTrackable.get(trackable.id) ?? [],
      range,
      today,
    }),
  );
  return {
    execution: goalExecution(results),
    outcome: goalOutcome(goal, views, logsByTrackable),
  };
}

/** One goal's trackables + logs, as read by {@link readGoals}. */
type GoalData = { views: TrackableView[]; logsByTrackable: Map<string, LogView[]> };

function computeDerived(
  activeGoal: GoalRow | null,
  activeGoals: GoalRow[],
  dataByGoal: Map<string, GoalData>,
  today: string,
): {
  trackables: TrackableView[];
  logsByTrackable: Map<string, LogView[]>;
  due: DueItem[];
  consistency: GoalConsistency | null;
  consistencyByGoal: Map<string, GoalConsistency>;
} {
  const consistencyByGoal = new Map<string, GoalConsistency>();
  const dueItems: DueItem[] = [];

  for (const goal of activeGoals) {
    const data = dataByGoal.get(goal.id) ?? { views: [], logsByTrackable: new Map() };
    consistencyByGoal.set(goal.id, goalConsistency(goal, data.views, data.logsByTrackable, today));
    // Merged and re-sorted below, not per goal — the deck is one day, not one
    // goal's day.
    dueItems.push(...dueOn(today, data.views, data.logsByTrackable));
  }
  dueItems.sort(byTimeThenTitle);

  const active = activeGoal ? dataByGoal.get(activeGoal.id) : undefined;

  return {
    trackables: active?.views ?? [],
    logsByTrackable: active?.logsByTrackable ?? new Map(),
    due: dueItems,
    consistency:
      activeGoal && active
        ? (consistencyByGoal.get(activeGoal.id) ??
          goalConsistency(activeGoal, active.views, active.logsByTrackable, today))
        : null,
    consistencyByGoal,
  };
}

/**
 * Read several goals' trackables, pauses and logs in three queries total, and
 * fold each goal's rows into parsed views.
 *
 * Batched rather than one `readGoal` per goal: five active goals is fifteen
 * round trips the naive way, and `loadCompass` runs on every write.
 */
function readGoals(goalIds: string[]): Map<string, GoalData> {
  const result = new Map<string, GoalData>();
  for (const id of goalIds) result.set(id, { views: [], logsByTrackable: new Map() });
  if (goalIds.length === 0) return result;

  const trackableRows = db
    .select()
    .from(trackables)
    .where(inArray(trackables.goalId, goalIds))
    .all();
  const trackableIds = trackableRows.map((r) => r.id);

  const pauseRows =
    trackableIds.length > 0
      ? db
          .select()
          .from(trackablePauses)
          .where(inArray(trackablePauses.trackableId, trackableIds))
          .all()
      : [];
  const logRows =
    trackableIds.length > 0
      ? db.select().from(trackableLogs).where(inArray(trackableLogs.trackableId, trackableIds)).all()
      : [];

  const pausesByTrackable = new Map<string, PauseWindow[]>();
  for (const row of pauseRows) {
    const list = pausesByTrackable.get(row.trackableId) ?? [];
    list.push({ startDate: row.startDate, endDate: row.endDate });
    pausesByTrackable.set(row.trackableId, list);
  }

  const logsByTrackableId = new Map<string, LogView[]>();
  for (const row of logRows) {
    const list = logsByTrackableId.get(row.trackableId) ?? [];
    list.push({
      id: row.id,
      trackableId: row.trackableId,
      date: row.date,
      completed: row.completed,
      value: row.value,
      note: row.note,
    });
    logsByTrackableId.set(row.trackableId, list);
  }

  for (const row of trackableRows) {
    const bucket = result.get(row.goalId);
    if (!bucket) continue;
    const schedule = parseSchedule(row.schedule);
    const measurement = parseMeasurement(row.measurement);
    if (!schedule || !measurement) {
      console.warn(`[Compass] Skipping trackable ${row.id}: unreadable schedule or measurement.`);
      continue;
    }
    bucket.views.push({
      id: row.id,
      goalId: row.goalId,
      title: row.title,
      description: row.description,
      timeOfDay: row.timeOfDay,
      startDate: row.startDate,
      endDate: row.endDate,
      status: row.status,
      schedule,
      measurement,
      pauses: pausesByTrackable.get(row.id) ?? [],
    });
    const logs = logsByTrackableId.get(row.id);
    if (logs) bucket.logsByTrackable.set(row.id, logs);
  }

  return result;
}

/**
 * The active goals, primary first then newest, capped at the max.
 *
 * `goals` arrives newest-first from `loadCompass`, so a stable partition keeps
 * that order within each half.
 */
function orderActiveGoals(all: GoalRow[]): GoalRow[] {
  const active = all.filter((g) => g.status === 'ACTIVE');
  const primary = active.filter((g) => g.isPrimary);
  const rest = active.filter((g) => !g.isPrimary);
  return [...primary, ...rest].slice(0, MAX_ACTIVE_GOALS);
}

export const useCompassStore = create<CompassState>((set, get) => ({
  goals: [],
  activeGoals: [],
  activeGoalId: null,
  primaryGoalId: null,
  trackables: [],
  logsByTrackable: new Map(),
  due: [],
  consistency: null,
  consistencyByGoal: new Map(),
  isLoaded: false,
  committing: false,
  error: null,

  loadCompass: async () => {
    const today = localDayString();
    const allGoals = db.select().from(goals).orderBy(desc(goals.createdAt)).all();
    const activeGoals = orderActiveGoals(allGoals);
    const primaryGoalId = activeGoals.find((g) => g.isPrimary)?.id ?? null;

    // What the per-goal surfaces (Insights, Planner, the conversation) point
    // at: the goal the reader last chose if it is still around, else the
    // primary, else the newest active one, else any goal at all.
    const activeGoal =
      allGoals.find((g) => g.id === get().activeGoalId) ??
      activeGoals.find((g) => g.id === primaryGoalId) ??
      activeGoals[0] ??
      allGoals[0] ??
      null;

    if (!activeGoal && activeGoals.length === 0) {
      set({
        goals: allGoals,
        activeGoals: [],
        activeGoalId: null,
        primaryGoalId: null,
        trackables: [],
        logsByTrackable: new Map(),
        due: [],
        consistency: null,
        consistencyByGoal: new Map(),
        isLoaded: true,
      });
      return;
    }

    // The viewed goal may not be active (an old goal's Insights), so read it
    // alongside the active set rather than assuming it is in it.
    const idsToRead = new Set(activeGoals.map((g) => g.id));
    if (activeGoal) idsToRead.add(activeGoal.id);
    const dataByGoal = readGoals([...idsToRead]);

    set({
      goals: allGoals,
      activeGoals,
      activeGoalId: activeGoal?.id ?? null,
      primaryGoalId,
      ...computeDerived(activeGoal, activeGoals, dataByGoal, today),
      isLoaded: true,
    });
  },

  selectGoal: async (goalId) => {
    set({ activeGoalId: goalId });
    await get().loadCompass();
  },

  setPrimaryGoal: async (goalId) => {
    if (get().primaryGoalId === goalId) return;
    const now = new Date().toISOString();
    // Two statements rather than a transaction, matching the rest of this
    // store: the sub-millisecond window with no primary self-corrects on the
    // reload below, and a half-applied primary is harmless (the reader picks
    // one again).
    db.update(goals).set({ isPrimary: 0, updatedAt: now }).where(eq(goals.isPrimary, 1)).run();
    db.update(goals).set({ isPrimary: 1, updatedAt: now }).where(eq(goals.id, goalId)).run();
    await get().loadCompass();
  },

  commitProposal: async (proposal) => {
    // A new goal joins the active set rather than replacing it, so the cap is
    // real and has to be enforced here — the one place a goal is created.
    if (get().activeGoals.length >= MAX_ACTIVE_GOALS) {
      set({
        error: `You can track ${MAX_ACTIVE_GOALS} goals at once. Finish or archive one to make room.`,
      });
      return null;
    }

    set({ committing: true, error: null });
    try {
      const now = new Date().toISOString();
      const startDate = localDayString();
      const endDate = addDaysYmd(startDate, proposal.durationDays);
      const goalId = createId('goal');
      // The first goal someone sets is their primary by default — there is
      // nothing to weigh it against yet, and an unset primary means Samwell
      // never steers.
      const isPrimary = get().activeGoals.length === 0 ? 1 : 0;

      db.insert(goals)
        .values({
          id: goalId,
          title: proposal.title,
          description: proposal.summary,
          startDate,
          endDate,
          category: proposal.category,
          priority: proposal.priority,
          status: 'ACTIVE',
          isPrimary,
          outcomeTarget: proposal.outcomeTarget,
          outcomeUnit: proposal.outcomeUnit,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      for (const t of proposal.trackables) {
        // The model proposes durations; the calendar is resolved here, where
        // the arithmetic is exact and the timezone is the device's own.
        const tStart = addDaysYmd(startDate, t.startOffsetDays);
        const tEnd = t.durationDays == null ? endDate : addDaysYmd(tStart, t.durationDays);
        db.insert(trackables)
          .values({
            id: createId('trk'),
            goalId,
            title: t.title,
            description: t.description,
            startDate: tStart,
            endDate: minYmd(tEnd, endDate),
            timeOfDay: t.timeOfDay,
            schedule: JSON.stringify(t.schedule),
            measurement: JSON.stringify(t.measurement),
            status: 'ACTIVE',
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }

      set({ activeGoalId: goalId, committing: false });
      await get().loadCompass();
      return goalId;
    } catch (err) {
      set({ error: friendlyError(err), committing: false });
      return null;
    }
  },

  applyCheckinDraft: async (draft) => {
    const today = localDayString();
    const now = new Date().toISOString();
    const { activeGoalId } = get();

    for (const adjustment of draft.adjustments) {
      const trackable = get().trackables.find((t) => t.id === adjustment.trackableId);
      if (!trackable) continue;

      switch (adjustment.action) {
        case 'PAUSE':
          await get().pauseTrackable(adjustment.trackableId);
          break;
        case 'RESUME':
          await get().resumeTrackable(adjustment.trackableId);
          break;
        case 'RETARGET': {
          if (adjustment.target == null) break;
          // Retargeting rewrites the schedule from here on. Past periods keep
          // the target they were judged against, because they are already in
          // the logs — history is not re-scored by a later decision.
          const schedule = trackable.schedule;
          if (schedule.type !== 'WEEKLY_TARGET' && schedule.type !== 'MONTHLY_TARGET') break;
          const next = { ...schedule, target: Math.round(adjustment.target) };
          db.update(trackables)
            .set({ schedule: JSON.stringify(next), updatedAt: now })
            .where(eq(trackables.id, adjustment.trackableId))
            .run();
          break;
        }
        case 'RETIRE':
          db.update(trackables)
            .set({ status: 'COMPLETED', endDate: today, updatedAt: now })
            .where(eq(trackables.id, adjustment.trackableId))
            .run();
          break;
      }
    }

    if (draft.journeyNote) {
      saveJourneyReflection(draft.journeyNote, activeGoalId ? `goal:${activeGoalId}` : 'compass');
    }

    await get().loadCompass();
  },

  logDone: async (trackableId, value, note, date) => {
    const trackable = get().trackables.find((t) => t.id === trackableId);
    if (!trackable) return;
    // A COMPLETION log says so with a 1; everything else carries its number and
    // leaves `completed` null, so whether it met the target stays derivable.
    const completed = trackable.measurement.type === 'COMPLETION' ? 1 : null;
    writeLog(trackableId, { completed, value, note }, date);
    patchAfterWrite(set, get);
  },

  logMissed: async (trackableId, note, date) => {
    writeLog(trackableId, { completed: 0, value: null, note }, date);
    patchAfterWrite(set, get);
  },

  undoLastLog: async () => {
    const ids = get()
      .trackables.map((t) => t.id);
    if (ids.length === 0) return;
    const last = db
      .select()
      .from(trackableLogs)
      .where(inArray(trackableLogs.trackableId, ids))
      .orderBy(desc(trackableLogs.createdAt))
      .limit(1)
      .get();
    if (!last) return;
    db.delete(trackableLogs).where(eq(trackableLogs.id, last.id)).run();
    patchAfterWrite(set, get);
  },

  pauseTrackable: async (trackableId) => {
    const today = localDayString();
    const now = new Date().toISOString();
    const open = db
      .select()
      .from(trackablePauses)
      .where(eq(trackablePauses.trackableId, trackableId))
      .all()
      .find((p) => p.endDate === null);
    if (!open) {
      db.insert(trackablePauses)
        .values({ id: createId('pause'), trackableId, startDate: today, endDate: null, createdAt: now })
        .run();
    }
    db.update(trackables)
      .set({ status: 'PAUSED', updatedAt: now })
      .where(eq(trackables.id, trackableId))
      .run();
    await get().loadCompass();
  },

  resumeTrackable: async (trackableId) => {
    const now = new Date().toISOString();
    // The pause closed YESTERDAY, so today is already active again — closing it
    // on today would leave today paused and quietly excused.
    const closedOn = addDaysYmd(localDayString(), -1);
    const open = db
      .select()
      .from(trackablePauses)
      .where(eq(trackablePauses.trackableId, trackableId))
      .all()
      .find((p) => p.endDate === null);
    if (open) {
      db.update(trackablePauses)
        .set({ endDate: closedOn < open.startDate ? open.startDate : closedOn })
        .where(eq(trackablePauses.id, open.id))
        .run();
    }
    db.update(trackables)
      .set({ status: 'ACTIVE', updatedAt: now })
      .where(eq(trackables.id, trackableId))
      .run();
    await get().loadCompass();
  },

  completeGoal: async (goalId) => {
    const now = new Date().toISOString();
    db.update(goals).set({ status: 'COMPLETED', updatedAt: now }).where(eq(goals.id, goalId)).run();
    await get().loadCompass();
  },

  cancelGoal: async (goalId) => {
    const now = new Date().toISOString();
    db.update(goals).set({ status: 'CANCELLED', updatedAt: now }).where(eq(goals.id, goalId)).run();
    await get().loadCompass();
  },

  clearError: () => set({ error: null }),
}));

function writeLog(
  trackableId: string,
  fields: { completed: number | null; value: number | null; note: string | null },
  /** The day being logged. Defaults to today, which is every case but Samwell
   *  catching up on a day the user forgot to log. */
  date?: Ymd,
): void {
  db.insert(trackableLogs)
    .values({
      id: createId('log'),
      trackableId,
      date: date ?? localDayString(),
      completed: fields.completed,
      value: fields.value,
      note: fields.note?.trim() || null,
      createdAt: new Date().toISOString(),
    })
    .run();
}

/**
 * Re-read the rows and recompute the derived bundle after a log.
 *
 * Not `loadCompass()`: the deck is on screen while the user is logging, and a
 * full reload rebuilds the goal list and the active-goal choice underneath it,
 * which flashes the card that is mid-animation. This keeps the goal list, the
 * active goal and the primary exactly as they are, and only refreshes the
 * numbers — including the merged deck and every goal's consistency, since a
 * log on any goal moves the overview too.
 */
function patchAfterWrite(
  set: (patch: Partial<CompassState>) => void,
  get: () => CompassState,
): void {
  const { activeGoalId, activeGoals, goals: allGoals } = get();
  const activeGoal = allGoals.find((g) => g.id === activeGoalId) ?? null;

  const ids = new Set(activeGoals.map((g) => g.id));
  if (activeGoalId) ids.add(activeGoalId);
  const dataByGoal = readGoals([...ids]);

  set(computeDerived(activeGoal, activeGoals, dataByGoal, localDayString()));
}

/** The picture of the goal that a check-in conversation is grounded in. */

// ── Narrow selectors ─────────────────────────────────────────────────────────
// Components subscribe through these rather than calling the store bare: the
// whole-store form re-renders a chat screen on every streamed token.

export const useCompassDue = () => useCompassStore((s) => s.due);
export const useCompassConsistency = () => useCompassStore((s) => s.consistency);
export const useCompassTrackables = () => useCompassStore((s) => s.trackables);
export const useCompassError = () => useCompassStore((s) => s.error);
export const useActiveGoal = () =>
  useCompassStore((s) => s.goals.find((g) => g.id === s.activeGoalId) ?? null);
export const useCompassActiveGoals = () => useCompassStore((s) => s.activeGoals);
export const usePrimaryGoal = () =>
  useCompassStore((s) => s.activeGoals.find((g) => g.id === s.primaryGoalId) ?? null);
export const useCompassConsistencyByGoal = () =>
  useCompassStore((s) => s.consistencyByGoal);
