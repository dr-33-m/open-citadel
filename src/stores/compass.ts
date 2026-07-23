import { and, desc, eq } from 'drizzle-orm';
import { create } from 'zustand';
import {
  CompassMorningAnalysisSchema,
  type CompassMorningAnalysis,
  type CompassMorningPlan,
  type CompassNightAnalysis,
  type CompassSetupProposal,
  type CompassTelemetry,
} from 'samwell-shared';

import { db } from '@/db/client';
import { compassActions, compassCheckins, compassGoals, compassMilestones } from '@/db/schema';
import {
  CompassApiError,
  requestMorningAnalysis,
  requestNightAnalysis,
  requestSetupProposal as apiRequestSetupProposal,
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
  setupProposal: CompassSetupProposal | null;
  isLoaded: boolean;
  submitting: 'setup' | 'morning' | 'night' | null;
  error: string | null;

  loadCompass: () => Promise<void>;
  requestSetupProposal: (description: string) => Promise<void>;
  clearSetupProposal: () => void;
  confirmSetup: (args: {
    targetDate: string;
    goalTitle?: string;
    milestoneTitle?: string;
    estimatedEffortUnits?: number;
  }) => Promise<boolean>;
  submitMorning: (text: string) => Promise<CompassMorningAnalysis | null>;
  submitNight: (text: string) => Promise<CompassNightAnalysis | null>;
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
      missionSummary: parsed.data.missionSummary,
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
  setupProposal: null,
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

  requestSetupProposal: async (description: string) => {
    set({ submitting: 'setup', error: null });
    try {
      const { goal } = get();
      const proposal = await apiRequestSetupProposal({
        ...(await cloudArgs()),
        body: {
          description,
          existingGoal: goal ? { title: goal.title, description: goal.description } : undefined,
          readingContext: selectReadingContext(
            goal ? `${goal.title} ${description}` : description,
          ),
        },
      });
      set({ setupProposal: proposal, submitting: null });
    } catch (err) {
      set({ error: friendlyError(err), submitting: null });
    }
  },

  clearSetupProposal: () => set({ setupProposal: null }),

  confirmSetup: async ({ targetDate, goalTitle, milestoneTitle, estimatedEffortUnits }) => {
    const { setupProposal } = get();
    if (!setupProposal) return false;

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
          title: goalTitle?.trim() || setupProposal.goalTitle,
          description: setupProposal.goalSummary,
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
        title: milestoneTitle?.trim() || setupProposal.milestoneTitle,
        effortUnitDefinition: setupProposal.effortUnitDefinition,
        status: 'active',
        estimatedEffortUnits: estimatedEffortUnits ?? setupProposal.estimatedEffortUnits,
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

    set({ setupProposal: null, error: null });
    await get().loadCompass();
    return true;
  },

  submitMorning: async (text: string) => {
    const { goal, milestone } = get();
    if (!goal || !milestone) return null;

    set({ submitting: 'morning', error: null });
    try {
      const compassDay = currentCompassDay();
      const telemetry = buildTelemetry(goal, milestone, compassDay);
      const analysis = await requestMorningAnalysis({
        ...(await cloudArgs()),
        body: {
          text,
          telemetry,
          readingContext: selectReadingContext(`${goal.title} ${milestone.title} ${text}`),
          journey: buildJourneySnapshot() || undefined,
        },
      });

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
          rawText: text,
          missionSummary: analysis.missionSummary,
          focusScore: computeFocusScore(analysis.actions),
          pitWallMessage: analysis.pitWallMessage,
          analysisJson: JSON.stringify(analysis),
          createdAt: now,
          updatedAt: now,
        })
        .run();
      insertActions(checkinId, analysis.actions, true, now);

      set({ submitting: null });
      await get().loadCompass();
      return analysis;
    } catch (err) {
      set({ error: friendlyError(err), submitting: null });
      return null;
    }
  },

  submitNight: async (text: string) => {
    const { goal, milestone } = get();
    if (!goal || !milestone) return null;

    set({ submitting: 'night', error: null });
    try {
      const compassDay = currentCompassDay();
      const telemetry = buildTelemetry(goal, milestone, compassDay);
      const analysis = await requestNightAnalysis({
        ...(await cloudArgs()),
        body: {
          text,
          telemetry,
          morningPlan: morningPlanFrom(get().todayMorning),
          readingContext: selectReadingContext(`${goal.title} ${milestone.title} ${text}`),
          journey: buildJourneySnapshot() || undefined,
        },
      });

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
          rawText: text,
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

      // Persist a journey reflection (distilled at zero extra cost from the night analysis).
      if (analysis.journeyNote) {
        saveJourneyReflection(analysis.journeyNote, checkinId);
      }

      set({ submitting: null });
      await get().loadCompass();
      return analysis;
    } catch (err) {
      set({ error: friendlyError(err), submitting: null });
      return null;
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
