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
import { goalOutcomes, goals, trackableLogs, trackablePauses, trackables } from '@/db/schema';
import {
  goalExecution,
  goalOutcome,
  trackableConsistency,
  type ConsistencyResult,
  type GoalExecution,
  type GoalOutcome,
} from '@/services/consistency';
import { saveGoalFinishedNote, saveJourneyReflection } from '@/services/journey';
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

export type GoalOutcomeRow = typeof goalOutcomes.$inferSelect;

/** An ended goal and its reconciliation, paired the way the archive shows it. */
export type PastGoal = {
  goal: GoalRow;
  outcome: GoalOutcomeRow;
};

type CompassState = {
  goals: GoalRow[];
  /**
   * The goals with `status === 'ACTIVE'`, primary first then newest — capped
   * at {@link MAX_ACTIVE_GOALS}. This is the set the switcher lists, the deck
   * merges over, and the overview charts.
   */
  activeGoals: GoalRow[];
  /** The one active goal marked `isPrimary`, or null when none is. */
  primaryGoalId: string | null;
  /**
   * Every active goal's trackables and logs, merged into one set.
   *
   * There used to be a "current" goal here and these held only its slice, so
   * the planner drew one goal's month and Samwell was told the ids of one
   * goal's trackables. Nothing points at a single goal any more: the deck was
   * always one day across every goal, and the planner and the tools are now
   * the same. `dataByGoal` is what a surface reads when it does want one goal
   * on its own.
   */
  trackables: TrackableView[];
  logsByTrackable: Map<string, LogView[]>;
  /** The same, kept per goal, so a single-goal view costs no second read. */
  dataByGoal: Map<string, GoalData>;

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
  /** Consistency + outcome per active goal, keyed by goal id. */
  consistencyByGoal: Map<string, GoalConsistency>;
  /**
   * The goals that have ended, most recently ended first, each with how it
   * ended.
   *
   * Held here rather than derived in a selector for the same reason as the
   * fields above: a selector building this array would hand back a new
   * reference on every store change, and this list sits under a screen that
   * updates on every streamed token.
   *
   * A goal whose status is COMPLETED or CANCELLED but which has no
   * `goal_outcomes` row is left out. Those are the ones the two unwired legacy
   * actions could produce — archived with nothing recorded about how — and a
   * page about a goal that can say nothing about how it went is worse than
   * that goal not being listed.
   */
  pastGoals: PastGoal[];

  isLoaded: boolean;
  committing: boolean;
  error: string | null;

  loadCompass: () => Promise<void>;
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
  /**
   * End a goal, and remember how it ended.
   *
   * `completeGoal` and `cancelGoal` only moved a status column, which is why
   * neither was ever wired to anything: a goal that simply disappears from the
   * active list teaches nobody anything. These two write the journal note as
   * well, so the way this goal went is still there to be read the next time a
   * goal like it is proposed.
   */
  finishGoal: (goalId: string) => Promise<void>;
  /** Retire a goal early. The reason is the reader's own words and is the part
   *  no amount of logged data could reconstruct. */
  abandonGoal: (goalId: string, reason: string | null) => Promise<void>;
  completeGoal: (goalId: string) => Promise<void>;
  cancelGoal: (goalId: string) => Promise<void>;
  /**
   * Store Samwell's reading of a finished goal.
   *
   * Written once, after the fact: the goal is already archived by the time the
   * cloud answers, and the archive page draws fine without it. Silently does
   * nothing if there is no outcome row to attach it to.
   */
  saveTakeaway: (goalId: string, takeaway: string) => Promise<void>;

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
export type GoalData = { views: TrackableView[]; logsByTrackable: Map<string, LogView[]> };

function computeDerived(
  activeGoals: GoalRow[],
  dataByGoal: Map<string, GoalData>,
  today: string,
): {
  trackables: TrackableView[];
  logsByTrackable: Map<string, LogView[]>;
  due: DueItem[];
  consistencyByGoal: Map<string, GoalConsistency>;
} {
  const consistencyByGoal = new Map<string, GoalConsistency>();
  const dueItems: DueItem[] = [];
  const trackables: TrackableView[] = [];
  const logsByTrackable = new Map<string, LogView[]>();

  for (const goal of activeGoals) {
    const data = dataByGoal.get(goal.id) ?? { views: [], logsByTrackable: new Map() };
    consistencyByGoal.set(goal.id, goalConsistency(goal, data.views, data.logsByTrackable, today));
    // Merged and re-sorted below, not per goal — the deck is one day, not one
    // goal's day, and so is the planner's month.
    dueItems.push(...dueOn(today, data.views, data.logsByTrackable));
    trackables.push(...data.views);
    // Keyed by trackable id, which is unique across goals, so goals cannot
    // collide here however many are running.
    for (const [trackableId, logs] of data.logsByTrackable) {
      logsByTrackable.set(trackableId, logs);
    }
  }
  dueItems.sort(byTimeThenTitle);

  return { trackables, logsByTrackable, due: dueItems, consistencyByGoal };
}

/**
 * Read several goals' trackables, pauses and logs in three queries total, and
 * fold each goal's rows into parsed views.
 *
 * Batched rather than one `readGoal` per goal: five active goals is fifteen
 * round trips the naive way, and `loadCompass` runs on every write.
 *
 * Exported for Samwell's tool layer, which resolves a trackable id against
 * every active goal rather than only the one being viewed.
 */
export function readGoals(goalIds: string[]): Map<string, GoalData> {
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
 * The ended goals, most recently ended first, paired with how they ended.
 *
 * Goals arrive here from a list that has already been read, so this is one
 * extra query rather than two. An archived goal with no `goal_outcomes` row is
 * dropped: those can only come from the two legacy actions that moved a status
 * column and recorded nothing, and a page that can say nothing about how a
 * goal went is worse than that goal not being in the list.
 */
function readPastGoals(all: GoalRow[]): PastGoal[] {
  const ended = all.filter((g) => g.status === 'COMPLETED' || g.status === 'CANCELLED');
  if (ended.length === 0) return [];

  const rows = db
    .select()
    .from(goalOutcomes)
    .where(
      inArray(
        goalOutcomes.goalId,
        ended.map((g) => g.id),
      ),
    )
    .all();
  const byGoal = new Map(rows.map((r) => [r.goalId, r]));

  return ended
    .flatMap((goal) => {
      const outcome = byGoal.get(goal.id);
      return outcome ? [{ goal, outcome }] : [];
    })
    .sort((a, b) => b.outcome.endedOn.localeCompare(a.outcome.endedOn));
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

/**
 * One trackable of any ACTIVE goal, with its JSON columns parsed.
 *
 * The deck is merged across goals and Samwell's tools take ids from any of
 * them, so a write can name a side goal's trackable while another goal is the
 * one being viewed — and the store only holds the viewed goal's views. The
 * rest are read from the database on the way in, active goals only.
 */
function readActiveTrackable(get: () => CompassState, trackableId: string): TrackableView | null {
  const held = get().trackables.find((t) => t.id === trackableId);
  if (held) return held;

  const row = db.select().from(trackables).where(eq(trackables.id, trackableId)).get();
  if (!row || !get().activeGoals.some((g) => g.id === row.goalId)) return null;
  const schedule = parseSchedule(row.schedule);
  const measurement = parseMeasurement(row.measurement);
  if (!schedule || !measurement) return null;
  return {
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
    pauses: db
      .select()
      .from(trackablePauses)
      .where(eq(trackablePauses.trackableId, row.id))
      .all()
      .map((p) => ({ startDate: p.startDate, endDate: p.endDate })),
  };
}

export const useCompassStore = create<CompassState>((set, get) => ({
  goals: [],
  activeGoals: [],
  primaryGoalId: null,
  trackables: [],
  logsByTrackable: new Map(),
  dataByGoal: new Map(),
  due: [],
  consistencyByGoal: new Map(),
  pastGoals: [],
  isLoaded: false,
  committing: false,
  error: null,

  loadCompass: async () => {
    const today = localDayString();
    const allGoals = db.select().from(goals).orderBy(desc(goals.createdAt)).all();
    const activeGoals = orderActiveGoals(allGoals);
    const primaryGoalId = activeGoals.find((g) => g.isPrimary)?.id ?? null;
    const pastGoals = readPastGoals(allGoals);

    if (activeGoals.length === 0) {
      set({
        goals: allGoals,
        pastGoals,
        activeGoals: [],
        primaryGoalId: null,
        trackables: [],
        logsByTrackable: new Map(),
        dataByGoal: new Map(),
        due: [],
        consistencyByGoal: new Map(),
        isLoaded: true,
      });
      return;
    }

    // Every active goal, in one batched read. There is no separate "viewed"
    // goal to fetch alongside them any more: every surface either wants the
    // whole set or picks one out of `dataByGoal`. A goal that is no longer
    // active — an old goal's Insights — is still read on demand by the view
    // that asks for it.
    const dataByGoal = readGoals(activeGoals.map((g) => g.id));

    set({
      goals: allGoals,
      pastGoals,
      activeGoals,
      primaryGoalId,
      dataByGoal,
      ...computeDerived(activeGoals, dataByGoal, today),
      isLoaded: true,
    });
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

      set({ committing: false });
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
    const { primaryGoalId } = get();

    for (const adjustment of draft.adjustments) {
      // Adjustments may name a side goal's trackable — the tool layer validates
      // ids against every active goal, so the application has to resolve the
      // same way.
      const trackable = readActiveTrackable(get, adjustment.trackableId);
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
      saveJourneyReflection(draft.journeyNote, primaryGoalId ? `goal:${primaryGoalId}` : 'compass');
    }

    await get().loadCompass();
  },

  logDone: async (trackableId, value, note, date) => {
    const trackable = readActiveTrackable(get, trackableId);
    if (!trackable) return;
    // A COMPLETION log says so with a 1; everything else carries its number and
    // leaves `completed` null, so whether it met the target stays derivable.
    const completed = trackable.measurement.type === 'COMPLETION' ? 1 : null;
    writeLog(trackableId, { completed, value, note }, date);
    patchAfterWrite(set, get);
  },

  logMissed: async (trackableId, note, date) => {
    // The same guard as `logDone`, so both outcomes agree on what exists: an
    // id from a goal that is not active writes nothing rather than a row
    // nothing reads.
    if (!readActiveTrackable(get, trackableId)) return;
    writeLog(trackableId, { completed: 0, value: null, note }, date);
    patchAfterWrite(set, get);
  },

  undoLastLog: async () => {
    // Every active goal's trackables: the log being undone may have come
    // from any goal's card in the deck.
    const goalIds = new Set(get().activeGoals.map((g) => g.id));
    const ids =
      goalIds.size === 0
        ? []
        : db
            .select({ id: trackables.id })
            .from(trackables)
            .where(inArray(trackables.goalId, [...goalIds]))
            .all()
            .map((r) => r.id);
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

  finishGoal: async (goalId) => {
    archiveGoal(get(), goalId, true, null);
    const now = new Date().toISOString();
    db.update(goals).set({ status: 'COMPLETED', updatedAt: now }).where(eq(goals.id, goalId)).run();
    await get().loadCompass();
  },

  abandonGoal: async (goalId, reason) => {
    archiveGoal(get(), goalId, false, reason);
    const now = new Date().toISOString();
    db.update(goals).set({ status: 'CANCELLED', updatedAt: now }).where(eq(goals.id, goalId)).run();
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

  saveTakeaway: async (goalId, takeaway) => {
    const text = takeaway.trim();
    if (!text) return;
    db.update(goalOutcomes)
      .set({ takeaway: text })
      .where(eq(goalOutcomes.goalId, goalId))
      .run();

    // Only the archive changes, so only the archive is re-read. A full
    // `loadCompass` here would rebuild the deck and every goal's consistency
    // to record a sentence about a goal that is no longer running.
    set({ pastGoals: readPastGoals(get().goals) });
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
  const { activeGoals } = get();
  const dataByGoal = readGoals(activeGoals.map((g) => g.id));

  set({ dataByGoal, ...computeDerived(activeGoals, dataByGoal, localDayString()) });
}

/**
 * Write the permanent note about how a goal ended, before it is archived.
 *
 * Read from the store's own derived numbers rather than recomputed: those are
 * the figures the reader was looking at when they pressed the button, and a
 * note that disagreed with the screen it was written from would be worse than
 * no note. Called before the status changes, while the goal is still in the
 * active set and its consistency is still there to read.
 */
function archiveGoal(
  state: CompassState,
  goalId: string,
  completed: boolean,
  reason: string | null,
): void {
  const goal = state.goals.find((g) => g.id === goalId);
  if (!goal) return;
  const consistency = state.consistencyByGoal.get(goalId) ?? null;
  const outcome = consistency?.outcome ?? null;

  saveGoalFinishedNote(goalId, goal.title, {
    completed,
    executionRatio: consistency?.execution.ratio ?? null,
    outcomeSummary: outcome ? `${outcome.value} of ${outcome.target} ${outcome.unit}` : null,
    reason,
  });

  // The same figures, kept structured, because the past-goal page draws them
  // rather than reading the note's prose. `onConflictDoUpdate` rather than
  // insert: nothing should be able to leave a goal with two endings.
  db.insert(goalOutcomes)
    .values({
      goalId,
      completed: completed ? 1 : 0,
      endedOn: localDayString(),
      executionRatio: consistency?.execution.ratio ?? null,
      outcomeValue: outcome?.value ?? null,
      outcomeTarget: outcome?.target ?? null,
      outcomeUnit: outcome?.unit ?? null,
      reason: reason?.trim() || null,
      takeaway: null,
      createdAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: goalOutcomes.goalId,
      set: {
        completed: completed ? 1 : 0,
        endedOn: localDayString(),
        executionRatio: consistency?.execution.ratio ?? null,
        outcomeValue: outcome?.value ?? null,
        outcomeTarget: outcome?.target ?? null,
        outcomeUnit: outcome?.unit ?? null,
        reason: reason?.trim() || null,
      },
    })
    .run();
}

/** The picture of the goal that a check-in conversation is grounded in. */

// ── Narrow selectors ─────────────────────────────────────────────────────────
// Components subscribe through these rather than calling the store bare: the
// whole-store form re-renders a chat screen on every streamed token.

export const useCompassDue = () => useCompassStore((s) => s.due);
export const useCompassTrackables = () => useCompassStore((s) => s.trackables);
export const useCompassError = () => useCompassStore((s) => s.error);
export const useCompassActiveGoals = () => useCompassStore((s) => s.activeGoals);
export const usePrimaryGoal = () =>
  useCompassStore((s) => s.activeGoals.find((g) => g.id === s.primaryGoalId) ?? null);
export const useCompassConsistencyByGoal = () =>
  useCompassStore((s) => s.consistencyByGoal);
export const useCompassPastGoals = () => useCompassStore((s) => s.pastGoals);
