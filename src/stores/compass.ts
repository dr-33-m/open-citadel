import { and, desc, eq } from 'drizzle-orm';
import { create } from 'zustand';
import {
  CompassMorningAnalysisSchema,
  type CompassChatMessage,
  type CompassMorningAnalysis,
  type CompassMorningPlan,
  type CompassMorningTurn,
  type CompassNightAnalysis,
  type CompassNightTurn,
  type CompassSetupProposal,
  type CompassSetupTurn,
  type CompassTelemetry,
} from 'samwell-shared';

import { db } from '@/db/client';
import { compassActions, compassCheckins, compassGoals, compassMilestones } from '@/db/schema';
import {
  CompassApiError,
  requestMorningTurn,
  requestNightTurn,
  requestSetupTurn,
} from '@/services/compass-api';
import {
  buildTelemetry,
  compassDayFor,
  computeFinalVarianceDays,
  computeFocusScore,
  computeProjection,
  daysBetween,
} from '@/services/compass-math';
import { syncCompassReminders } from '@/services/compass-notifications';
import { selectReadingContext } from '@/services/compass-reading';
import { buildJourneySnapshot, saveJourneyReflection } from '@/services/journey';
import { useSettingsStore } from '@/stores/settings';

export type CompassGoalRow = typeof compassGoals.$inferSelect;
export type CompassMilestoneRow = typeof compassMilestones.$inferSelect;
export type CompassCheckinRow = typeof compassCheckins.$inferSelect;

type CompassState = {
  goal: CompassGoalRow | null;
  milestone: CompassMilestoneRow | null;
  lastCompletedMilestone: CompassMilestoneRow | null;
  todayMorning: CompassCheckinRow | null;
  todayNight: CompassCheckinRow | null;
  recentCheckins: CompassCheckinRow[];
  telemetry: CompassTelemetry | null;
  isLoaded: boolean;
  submitting: 'setup' | 'morning' | 'night' | null;
  error: string | null;

  loadCompass: () => Promise<void>;
  // Conversational turns: send the exchange so far, get Samwell's reply + an
  // optional structured draft. Nothing is persisted until the driver finalizes.
  sendSetupTurn: (messages: CompassChatMessage[]) => Promise<CompassSetupTurn | null>;
  sendMorningTurn: (messages: CompassChatMessage[]) => Promise<CompassMorningTurn | null>;
  sendNightTurn: (messages: CompassChatMessage[]) => Promise<CompassNightTurn | null>;
  finalizeSetup: (args: {
    proposal: CompassSetupProposal;
    targetDate: string;
    goalTitle?: string;
    milestoneTitle?: string;
    estimatedEffortUnits?: number;
  }) => Promise<boolean>;
  finalizeMorning: (args: { analysis: CompassMorningAnalysis; transcript: string }) => Promise<boolean>;
  finalizeNight: (args: { analysis: CompassNightAnalysis; transcript: string }) => Promise<boolean>;
  completeMilestone: () => Promise<void>;
  clearError: () => void;
};

function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function currentCompassDay(): string {
  const { compassMorningTime, compassNightTime } = useSettingsStore.getState();
  return compassDayFor(new Date(), compassMorningTime, compassNightTime);
}

function userText(messages: CompassChatMessage[]): string {
  return messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join(' ');
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

function deleteCheckin(checkinId: string): void {
  db.delete(compassActions).where(eq(compassActions.checkinId, checkinId)).run();
  db.delete(compassCheckins).where(eq(compassCheckins.id, checkinId)).run();
}

function insertActions(
  checkinId: string,
  actions: CompassMorningAnalysis['actions'],
  planned: boolean,
  now: string,
): void {
  for (const action of actions) {
    db.insert(compassActions)
      .values({
        id: createId('cact'),
        checkinId,
        description: action.description,
        category: action.category,
        alignment: action.alignment,
        minutes: action.minutes,
        effortUnits: action.effortUnits,
        planned: planned ? 1 : 0,
        createdAt: now,
      })
      .run();
  }
}

function morningPlanFrom(checkin: CompassCheckinRow | null): CompassMorningPlan | null {
  if (!checkin) return null;
  try {
    const parsed = CompassMorningAnalysisSchema.safeParse(JSON.parse(checkin.analysisJson));
    if (!parsed.success) return null;
    return {
      missionSummary: parsed.data.mission.map((m) => m.title).join('; '),
      actions: parsed.data.actions.map((a) => ({
        description: a.description,
        category: a.category,
        alignment: a.alignment,
      })),
    };
  } catch {
    return null;
  }
}

export const useCompassStore = create<CompassState>((set, get) => ({
  goal: null,
  milestone: null,
  lastCompletedMilestone: null,
  todayMorning: null,
  todayNight: null,
  recentCheckins: [],
  telemetry: null,
  isLoaded: false,
  submitting: null,
  error: null,

  loadCompass: async () => {
    const goal =
      db.select().from(compassGoals).where(eq(compassGoals.status, 'active')).get() ?? null;

    let milestone: CompassMilestoneRow | null = null;
    let lastCompletedMilestone: CompassMilestoneRow | null = null;
    let todayMorning: CompassCheckinRow | null = null;
    let todayNight: CompassCheckinRow | null = null;
    let recentCheckins: CompassCheckinRow[] = [];
    let telemetry: CompassTelemetry | null = null;

    if (goal) {
      milestone =
        db
          .select()
          .from(compassMilestones)
          .where(
            and(eq(compassMilestones.goalId, goal.id), eq(compassMilestones.status, 'active')),
          )
          .orderBy(desc(compassMilestones.sortOrder))
          .get() ?? null;

      lastCompletedMilestone =
        db
          .select()
          .from(compassMilestones)
          .where(
            and(
              eq(compassMilestones.goalId, goal.id),
              eq(compassMilestones.status, 'completed'),
            ),
          )
          .orderBy(desc(compassMilestones.sortOrder))
          .get() ?? null;

      const compassDay = currentCompassDay();
      todayMorning =
        db
          .select()
          .from(compassCheckins)
          .where(
            and(
              eq(compassCheckins.goalId, goal.id),
              eq(compassCheckins.localDate, compassDay),
              eq(compassCheckins.kind, 'morning'),
            ),
          )
          .get() ?? null;
      todayNight =
        db
          .select()
          .from(compassCheckins)
          .where(
            and(
              eq(compassCheckins.goalId, goal.id),
              eq(compassCheckins.localDate, compassDay),
              eq(compassCheckins.kind, 'night'),
            ),
          )
          .get() ?? null;

      recentCheckins = db
        .select()
        .from(compassCheckins)
        .where(eq(compassCheckins.goalId, goal.id))
        .orderBy(desc(compassCheckins.localDate), desc(compassCheckins.createdAt))
        .limit(7)
        .all();

      if (milestone) {
        telemetry = buildTelemetry(goal, milestone, compassDay);
      }
    }

    set({
      goal,
      milestone,
      lastCompletedMilestone,
      todayMorning,
      todayNight,
      recentCheckins,
      telemetry,
      isLoaded: true,
    });
  },

  sendSetupTurn: async (messages) => {
    set({ submitting: 'setup', error: null });
    try {
      const { goal } = get();
      const turn = await requestSetupTurn({
        ...(await cloudArgs()),
        body: {
          messages,
          existingGoal: goal ? { title: goal.title, description: goal.description } : undefined,
          readingContext: selectReadingContext(
            goal ? `${goal.title} ${userText(messages)}` : userText(messages),
          ),
        },
      });
      set({ submitting: null });
      return turn;
    } catch (err) {
      set({ error: friendlyError(err), submitting: null });
      return null;
    }
  },

  sendMorningTurn: async (messages) => {
    const { goal, milestone } = get();
    if (!goal || !milestone) return null;

    set({ submitting: 'morning', error: null });
    try {
      const telemetry = buildTelemetry(goal, milestone, currentCompassDay());
      const turn = await requestMorningTurn({
        ...(await cloudArgs()),
        body: {
          messages,
          telemetry,
          readingContext: selectReadingContext(
            `${goal.title} ${milestone.title} ${userText(messages)}`,
          ),
          journey: buildJourneySnapshot() || undefined,
        },
      });
      set({ submitting: null });
      return turn;
    } catch (err) {
      set({ error: friendlyError(err), submitting: null });
      return null;
    }
  },

  sendNightTurn: async (messages) => {
    const { goal, milestone } = get();
    if (!goal || !milestone) return null;

    set({ submitting: 'night', error: null });
    try {
      const telemetry = buildTelemetry(goal, milestone, currentCompassDay());
      const turn = await requestNightTurn({
        ...(await cloudArgs()),
        body: {
          messages,
          telemetry,
          morningPlan: morningPlanFrom(get().todayMorning),
          readingContext: selectReadingContext(
            `${goal.title} ${milestone.title} ${userText(messages)}`,
          ),
          journey: buildJourneySnapshot() || undefined,
        },
      });
      set({ submitting: null });
      return turn;
    } catch (err) {
      set({ error: friendlyError(err), submitting: null });
      return null;
    }
  },

  finalizeSetup: async ({ proposal, targetDate, goalTitle, milestoneTitle, estimatedEffortUnits }) => {
    const now = new Date().toISOString();
    const startDate = currentCompassDay();
    if (daysBetween(startDate, targetDate) <= 0) {
      set({ error: 'The target date must be after today.' });
      return false;
    }

    let goal = get().goal;
    if (!goal) {
      const goalId = createId('cgoal');
      db.insert(compassGoals)
        .values({
          id: goalId,
          title: goalTitle?.trim() || proposal.goalTitle,
          description: proposal.goalSummary,
          status: 'active',
          createdAt: now,
        })
        .run();
      goal = db.select().from(compassGoals).where(eq(compassGoals.id, goalId)).get() ?? null;
      if (!goal) return false;
    }

    const priorMilestones = db
      .select()
      .from(compassMilestones)
      .where(eq(compassMilestones.goalId, goal.id))
      .all();

    db.insert(compassMilestones)
      .values({
        id: createId('cmile'),
        goalId: goal.id,
        title: milestoneTitle?.trim() || proposal.milestoneTitle,
        effortUnitDefinition: proposal.effortUnitDefinition,
        status: 'active',
        estimatedEffortUnits: estimatedEffortUnits ?? proposal.estimatedEffortUnits,
        completedEffortUnits: 0,
        startDate,
        targetDate,
        originalEstimateDays: daysBetween(startDate, targetDate),
        sortOrder: priorMilestones.length,
        createdAt: now,
      })
      .run();

    const { compassMorningTime, compassNightTime } = useSettingsStore.getState();
    await syncCompassReminders({
      morningTime: compassMorningTime,
      nightTime: compassNightTime,
      hasActiveGoal: true,
    });

    set({ error: null });
    await get().loadCompass();
    return true;
  },

  finalizeMorning: async ({ analysis, transcript }) => {
    const { goal, milestone } = get();
    if (!goal || !milestone) return false;

    try {
      const compassDay = currentCompassDay();
      const now = new Date().toISOString();
      const existing = get().todayMorning;
      if (existing) deleteCheckin(existing.id);

      const checkinId = createId('cchk');
      db.insert(compassCheckins)
        .values({
          id: checkinId,
          goalId: goal.id,
          milestoneId: milestone.id,
          localDate: compassDay,
          kind: 'morning',
          rawText: transcript,
          missionSummary: analysis.mission.map((m) => m.title).join('\n'),
          focusScore: computeFocusScore(analysis.actions),
          pitWallMessage: analysis.pitWallMessage,
          analysisJson: JSON.stringify(analysis),
          createdAt: now,
          updatedAt: now,
        })
        .run();
      insertActions(checkinId, analysis.actions, true, now);

      await get().loadCompass();
      return true;
    } catch (err) {
      set({ error: friendlyError(err) });
      return false;
    }
  },

  finalizeNight: async ({ analysis, transcript }) => {
    const { goal, milestone } = get();
    if (!goal || !milestone) return false;

    try {
      const compassDay = currentCompassDay();
      const now = new Date().toISOString();
      const existing = get().todayNight;
      const previousUnits = existing?.effortUnitsCompleted ?? 0;
      if (existing) deleteCheckin(existing.id);

      const checkinId = createId('cchk');
      db.insert(compassCheckins)
        .values({
          id: checkinId,
          goalId: goal.id,
          milestoneId: milestone.id,
          localDate: compassDay,
          kind: 'night',
          rawText: transcript,
          focusScore: computeFocusScore(analysis.actions),
          effortUnitsCompleted: analysis.effortUnitsCompleted,
          pitWallMessage: analysis.pitWallMessage,
          analysisJson: JSON.stringify(analysis),
          createdAt: now,
          updatedAt: now,
        })
        .run();
      insertActions(checkinId, analysis.actions, false, now);

      const completedEffortUnits = Math.max(
        0,
        milestone.completedEffortUnits - previousUnits + analysis.effortUnitsCompleted,
      );
      const { projectedDate } = computeProjection({
        completedUnits: completedEffortUnits,
        estimatedUnits: milestone.estimatedEffortUnits,
        startDate: milestone.startDate,
        today: compassDay,
      });
      db.update(compassMilestones)
        .set({ completedEffortUnits, currentProjectedDate: projectedDate })
        .where(eq(compassMilestones.id, milestone.id))
        .run();

      // Persist a journey reflection (distilled at zero extra cost from the analysis).
      if (analysis.journeyNote) {
        saveJourneyReflection(analysis.journeyNote, checkinId);
      }

      await get().loadCompass();
      return true;
    } catch (err) {
      set({ error: friendlyError(err) });
      return false;
    }
  },

  completeMilestone: async () => {
    const { milestone } = get();
    if (!milestone) return;

    const actualCompletedDate = currentCompassDay();
    db.update(compassMilestones)
      .set({
        status: 'completed',
        actualCompletedDate,
        finalVarianceDays: computeFinalVarianceDays(milestone.targetDate, actualCompletedDate),
      })
      .where(eq(compassMilestones.id, milestone.id))
      .run();

    const { compassMorningTime, compassNightTime } = useSettingsStore.getState();
    await syncCompassReminders({
      morningTime: compassMorningTime,
      nightTime: compassNightTime,
      hasActiveGoal: false,
    });

    await get().loadCompass();
  },

  clearError: () => set({ error: null }),
}));
