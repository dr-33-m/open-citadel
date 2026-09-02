import { desc, eq, inArray } from 'drizzle-orm';
import { create } from 'zustand';
import {
  MeasurementSchema,
  ScheduleSchema,
  type Adjustment,
  type CompassChatMessage,
  type CompassCheckinContext,
  type CompassCheckinTurn,
  type CompassPlanTurn,
  type GoalProposal,
  type Measurement,
  type Schedule,
} from 'samwell-shared';

import { db } from '@/db/client';
import { goals, trackableLogs, trackablePauses, trackables } from '@/db/schema';
import { CompassApiError, requestCheckinTurn, requestPlanTurn } from '@/services/compass-api';
import { selectReadingContext } from '@/services/compass-reading';
import {
  goalExecution,
  goalOutcome,
  trackableConsistency,
  type ConsistencyResult,
  type GoalExecution,
  type GoalOutcome,
} from '@/services/consistency';
import { buildJourneySnapshot, saveJourneyReflection } from '@/services/journey';
import {
  dueOn,
  scheduleSummary,
  type DueItem,
  type LogView,
  type PauseWindow,
  type TrackableView,
} from '@/services/occurrences';
import { useSettingsStore } from '@/stores/settings';
import { addDaysYmd, localDayString, minYmd } from '@/utils/day';

export type GoalRow = typeof goals.$inferSelect;

export type GoalConsistency = {
  execution: GoalExecution;
  outcome: GoalOutcome | null;
};

type CompassState = {
  goals: GoalRow[];
  activeGoalId: string | null;
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
  due: DueItem[];
  consistency: GoalConsistency | null;

  isLoaded: boolean;
  submitting: 'plan' | 'checkin' | null;
  /**
   * Samwell's reply while it is still being written.
   *
   * A stored field rather than something derived in a selector, and cleared
   * the moment the turn lands so the finished message is rendered once, by the
   * transcript, rather than twice.
   */
  streamingReply: string;
  /**
   * The model's reasoning for the turn in flight.
   *
   * Kept after the turn lands rather than cleared with the reply, so the
   * folded "Thought for 8 seconds" row stays with the answer it produced. The
   * next turn is what clears it.
   */
  streamingThinking: string;
  committing: boolean;
  error: string | null;

  loadCompass: () => Promise<void>;
  selectGoal: (goalId: string) => Promise<void>;

  sendPlanTurn: (messages: CompassChatMessage[]) => Promise<CompassPlanTurn | null>;
  sendCheckinTurn: (messages: CompassChatMessage[]) => Promise<CompassCheckinTurn | null>;
  commitProposal: (proposal: GoalProposal) => Promise<string | null>;
  applyCheckinDraft: (draft: {
    journeyNote: string | null;
    adjustments: Adjustment[];
  }) => Promise<void>;

  logDone: (trackableId: string, value: number | null, note: string | null) => Promise<void>;
  logMissed: (trackableId: string, note: string | null) => Promise<void>;
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
  if (err instanceof CompassApiError) return err.message;
  return err instanceof Error ? err.message : 'Something went wrong. Try again.';
}

async function cloudArgs(): Promise<{ baseUrl: string; deviceId: string }> {
  const { cloudBaseUrl, getCloudDeviceId } = useSettingsStore.getState();
  if (!cloudBaseUrl) {
    throw new CompassApiError('network', 'Samwell Cloud is not configured for this build.');
  }
  return { baseUrl: cloudBaseUrl, deviceId: await getCloudDeviceId() };
}

function userText(messages: CompassChatMessage[]): string {
  return messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join(' ')
    .slice(0, 600);
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

function computeDerived(
  goal: GoalRow | null,
  views: TrackableView[],
  logsByTrackable: Map<string, LogView[]>,
  today: string,
): { due: DueItem[]; consistency: GoalConsistency | null } {
  if (!goal) return { due: [], consistency: null };

  const range = goalWindow(goal, today);
  const results: ConsistencyResult[] = views.map((trackable) =>
    trackableConsistency({
      trackable,
      logs: logsByTrackable.get(trackable.id) ?? [],
      range,
    }),
  );

  return {
    due: dueOn(today, views, logsByTrackable),
    consistency: {
      execution: goalExecution(results),
      outcome: goalOutcome(goal, views, logsByTrackable),
    },
  };
}

/** Read one goal's trackables, pauses and logs, and fold them into views. */
function readGoal(goalId: string): {
  views: TrackableView[];
  logsByTrackable: Map<string, LogView[]>;
} {
  const rows = db.select().from(trackables).where(eq(trackables.goalId, goalId)).all();
  const ids = rows.map((r) => r.id);

  const pauseRows =
    ids.length > 0
      ? db.select().from(trackablePauses).where(inArray(trackablePauses.trackableId, ids)).all()
      : [];
  const logRows =
    ids.length > 0
      ? db.select().from(trackableLogs).where(inArray(trackableLogs.trackableId, ids)).all()
      : [];

  const pausesByTrackable = new Map<string, PauseWindow[]>();
  for (const row of pauseRows) {
    const list = pausesByTrackable.get(row.trackableId) ?? [];
    list.push({ startDate: row.startDate, endDate: row.endDate });
    pausesByTrackable.set(row.trackableId, list);
  }

  const logsByTrackable = new Map<string, LogView[]>();
  for (const row of logRows) {
    const list = logsByTrackable.get(row.trackableId) ?? [];
    list.push({
      id: row.id,
      trackableId: row.trackableId,
      date: row.date,
      completed: row.completed,
      value: row.value,
      note: row.note,
    });
    logsByTrackable.set(row.trackableId, list);
  }

  const views: TrackableView[] = [];
  for (const row of rows) {
    const schedule = parseSchedule(row.schedule);
    const measurement = parseMeasurement(row.measurement);
    if (!schedule || !measurement) {
      console.warn(`[Compass] Skipping trackable ${row.id}: unreadable schedule or measurement.`);
      continue;
    }
    views.push({
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
  }

  return { views, logsByTrackable };
}

export const useCompassStore = create<CompassState>((set, get) => ({
  goals: [],
  activeGoalId: null,
  trackables: [],
  logsByTrackable: new Map(),
  due: [],
  consistency: null,
  isLoaded: false,
  submitting: null,
  streamingReply: '',
  streamingThinking: '',
  committing: false,
  error: null,

  loadCompass: async () => {
    const allGoals = db.select().from(goals).orderBy(desc(goals.createdAt)).all();
    const active =
      allGoals.find((g) => g.id === get().activeGoalId) ??
      allGoals.find((g) => g.status === 'ACTIVE') ??
      allGoals[0] ??
      null;

    if (!active) {
      set({
        goals: allGoals,
        activeGoalId: null,
        trackables: [],
        logsByTrackable: new Map(),
        due: [],
        consistency: null,
        isLoaded: true,
      });
      return;
    }

    const { views, logsByTrackable } = readGoal(active.id);
    const derived = computeDerived(active, views, logsByTrackable, localDayString());

    set({
      goals: allGoals,
      activeGoalId: active.id,
      trackables: views,
      logsByTrackable,
      ...derived,
      isLoaded: true,
    });
  },

  selectGoal: async (goalId) => {
    set({ activeGoalId: goalId });
    await get().loadCompass();
  },

  sendPlanTurn: async (messages) => {
    set({ submitting: 'plan', streamingReply: '', streamingThinking: '', error: null });
    try {
      // Appended rather than replaced, so a render only ever sees the reply
      // grow. `restart` is the one case where it goes back, and it only fires
      // while the reply is unfinished: what is dropped was never a message.
      const handlers = {
        onThinkingDelta: (delta: string) =>
          set((state) => ({ streamingThinking: state.streamingThinking + delta })),
        onReplyDelta: (delta: string) =>
          set((state) => ({ streamingReply: state.streamingReply + delta })),
        onRestart: () => set({ streamingReply: '', streamingThinking: '' }),
      };
      const turn = await requestPlanTurn({
        ...(await cloudArgs()),
        handlers,
        body: {
          messages,
          context: {
            today: localDayString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          },
          readingContext: selectReadingContext(userText(messages)),
          journey: buildJourneySnapshot() || undefined,
        },
      });
      set({ submitting: null, streamingReply: '' });
      return turn;
    } catch (err) {
      set({ error: friendlyError(err), submitting: null, streamingReply: '' });
      return null;
    }
  },

  sendCheckinTurn: async (messages) => {
    set({ submitting: 'checkin', streamingReply: '', streamingThinking: '', error: null });
    try {
      const { goals: allGoals, activeGoalId, trackables: views, logsByTrackable } = get();
      const goal = allGoals.find((g) => g.id === activeGoalId);
      if (!goal) throw new CompassApiError('server', 'No goal is active.');

      // Appended rather than replaced, so a render only ever sees the reply
      // grow. `restart` is the one case where it goes back, and it only fires
      // while the reply is unfinished: what is dropped was never a message.
      const handlers = {
        onThinkingDelta: (delta: string) =>
          set((state) => ({ streamingThinking: state.streamingThinking + delta })),
        onReplyDelta: (delta: string) =>
          set((state) => ({ streamingReply: state.streamingReply + delta })),
        onRestart: () => set({ streamingReply: '', streamingThinking: '' }),
      };
      const turn = await requestCheckinTurn({
        ...(await cloudArgs()),
        handlers,
        body: {
          messages,
          context: buildCheckinContext(goal, views, logsByTrackable),
          readingContext: selectReadingContext(`${goal.title} ${userText(messages)}`),
          journey: buildJourneySnapshot() || undefined,
        },
      });
      set({ submitting: null, streamingReply: '' });
      return turn;
    } catch (err) {
      set({ error: friendlyError(err), submitting: null, streamingReply: '' });
      return null;
    }
  },

  commitProposal: async (proposal) => {
    set({ committing: true, error: null });
    try {
      const now = new Date().toISOString();
      const startDate = localDayString();
      const endDate = addDaysYmd(startDate, proposal.durationDays);
      const goalId = createId('goal');

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

  logDone: async (trackableId, value, note) => {
    const trackable = get().trackables.find((t) => t.id === trackableId);
    if (!trackable) return;
    // A COMPLETION log says so with a 1; everything else carries its number and
    // leaves `completed` null, so whether it met the target stays derivable.
    const completed = trackable.measurement.type === 'COMPLETION' ? 1 : null;
    writeLog(trackableId, { completed, value, note });
    patchAfterWrite(set, get);
  },

  logMissed: async (trackableId, note) => {
    writeLog(trackableId, { completed: 0, value: null, note });
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
): void {
  db.insert(trackableLogs)
    .values({
      id: createId('log'),
      trackableId,
      date: localDayString(),
      completed: fields.completed,
      value: fields.value,
      note: fields.note?.trim() || null,
      createdAt: new Date().toISOString(),
    })
    .run();
}

/**
 * Re-read this goal's rows and recompute after a log.
 *
 * Not `loadCompass()`: the deck is on screen while the user is logging, and a
 * full reload rebuilds the goal list and the active-goal choice underneath it,
 * which flashes the card that is mid-animation.
 */
function patchAfterWrite(
  set: (patch: Partial<CompassState>) => void,
  get: () => CompassState,
): void {
  const { activeGoalId, goals: allGoals } = get();
  if (!activeGoalId) return;
  const goal = allGoals.find((g) => g.id === activeGoalId) ?? null;

  const { views, logsByTrackable } = readGoal(activeGoalId);
  set({
    trackables: views,
    logsByTrackable,
    ...computeDerived(goal, views, logsByTrackable, localDayString()),
  });
}

/** The picture of the goal that a check-in conversation is grounded in. */
function buildCheckinContext(
  goal: GoalRow,
  views: TrackableView[],
  logsByTrackable: Map<string, LogView[]>,
): CompassCheckinContext {
  const today = localDayString();
  const range = goalWindow(goal, today);

  const results = views.map((trackable) =>
    trackableConsistency({ trackable, logs: logsByTrackable.get(trackable.id) ?? [], range }),
  );
  const execution = goalExecution(results);
  const outcome = goalOutcome(goal, views, logsByTrackable);

  const byId = new Map(results.map((r) => [r.trackableId, r]));

  // The journal: what the user wrote when they logged, wins and misses alike.
  // Newest first and capped, because this is the material the conversation is
  // actually about and the oldest note is the least likely to still matter.
  const titles = new Map(views.map((t) => [t.id, t.title]));
  const recentNotes = [...logsByTrackable.values()]
    .flat()
    .filter((log) => log.note != null && log.note.length > 0)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 30)
    .map((log) => ({
      date: log.date,
      trackableTitle: titles.get(log.trackableId) ?? 'Unknown',
      completed: log.completed !== 0,
      note: (log.note ?? '').slice(0, 1000),
    }));

  return {
    today,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    goalTitle: goal.title,
    goalSummary: goal.description,
    startDate: goal.startDate,
    endDate: goal.endDate,
    daysRemaining: Math.max(
      0,
      Math.round(
        (new Date(`${goal.endDate}T00:00:00Z`).getTime() -
          new Date(`${today}T00:00:00Z`).getTime()) /
          86_400_000,
      ),
    ),
    executionRatio: execution.ratio,
    outcome,
    trackables: views.slice(0, 5).map((t) => {
      const result = byId.get(t.id);
      return {
        id: t.id,
        title: t.title,
        status: t.status,
        scheduleSummary: scheduleSummary(t.schedule),
        expected: result?.expected ?? 0,
        completed: result?.completed ?? 0,
        ratio: result?.ratio ?? null,
      };
    }),
    recentNotes,
  };
}

// ── Narrow selectors ─────────────────────────────────────────────────────────
// Components subscribe through these rather than calling the store bare: the
// whole-store form re-renders a chat screen on every streamed token.

export const useCompassDue = () => useCompassStore((s) => s.due);
export const useCompassConsistency = () => useCompassStore((s) => s.consistency);
export const useCompassTrackables = () => useCompassStore((s) => s.trackables);
export const useCompassError = () => useCompassStore((s) => s.error);
export const useCompassSubmitting = () => useCompassStore((s) => s.submitting);
export const useActiveGoal = () =>
  useCompassStore((s) => s.goals.find((g) => g.id === s.activeGoalId) ?? null);
