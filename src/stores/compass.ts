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
import { currentCompassDay } from '@/services/compass-day';
import {
  buildTelemetry,
  computeFinalVarianceDays,
  computeFocusScore,
  computeGoalTrack,
  computeProgress,
  computeProjection,
  daysBetween,
  deriveGoalRank,
  earliestYmd,
  isGoalComplete,
  isMilestoneFullyStepped,
  latestYmd,
  stepThresholdDate,
} from '@/services/compass-math';
import { syncCompassReminders } from '@/services/compass-notifications';
import { selectReadingContext } from '@/services/compass-reading';
import { buildJourneySnapshot, saveGoalFinishedNote, saveJourneyReflection } from '@/services/journey';
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
    /** The near commitment: when THIS milestone is due. */
    milestoneTargetDate: string;
    /** The outer commitment. Ignored when the goal already has one. */
    goalTargetDate?: string | null;
    goalTitle?: string;
    milestoneTitle?: string;
    estimatedEffortUnits?: number;
  }) => Promise<boolean>;
  /** Re-commit the dates on an existing race, for a milestone that was mis-scoped at setup. */
  updateTargetDates: (args: {
    milestoneTargetDate?: string;
    goalTargetDate?: string;
  }) => Promise<boolean>;
  finalizeMorning: (args: { analysis: CompassMorningAnalysis; transcript: string }) => Promise<boolean>;
  finalizeNight: (args: { analysis: CompassNightAnalysis; transcript: string }) => Promise<boolean>;
  completeMilestone: () => Promise<void>;
  /** Retire the current goal so a fresh one can be planned. History is kept, not deleted. */
  archiveGoal: () => Promise<void>;
  clearError: () => void;
};

function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
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

function completedMilestonesFor(goalId: string): CompassMilestoneRow[] {
  return db
    .select()
    .from(compassMilestones)
    .where(and(eq(compassMilestones.goalId, goalId), eq(compassMilestones.status, 'completed')))
    .all();
}

/**
 * When a milestone actually finished: the night check-in whose steps crossed the
 * estimate, else the last day reported, else today. Dating it by the moment the
 * driver pressed a button would put the same lag into the milestone's variance
 * that the goal's rank was just freed from.
 */
function milestoneFinishDate(milestone: CompassMilestoneRow, fallbackDay: string): string {
  const reports = db
    .select({
      date: compassCheckins.localDate,
      units: compassCheckins.effortUnitsCompleted,
    })
    .from(compassCheckins)
    .where(
      and(eq(compassCheckins.milestoneId, milestone.id), eq(compassCheckins.kind, 'night')),
    )
    .all();

  return (
    stepThresholdDate(
      reports.map((r) => ({ date: r.date, units: r.units ?? 0 })),
      milestone.estimatedEffortUnits,
    ) ??
    milestone.lastReportedDate ??
    fallbackDay
  );
}

/** Mark a milestone done, dated by when the work landed and graded against its own target. */
function completeMilestoneRow(milestone: CompassMilestoneRow, fallbackDay: string): string {
  const actualCompletedDate = milestoneFinishDate(milestone, fallbackDay);
  db.update(compassMilestones)
    .set({
      status: 'completed',
      actualCompletedDate,
      finalVarianceDays: computeFinalVarianceDays(milestone.targetDate, actualCompletedDate),
    })
    .where(eq(compassMilestones.id, milestone.id))
    .run();
  return actualCompletedDate;
}

/**
 * Recompute and persist the goal's own projection. Called from every write that
 * moves goal-level progress — a night check-in AND a milestone completion — so
 * the stored date can't go stale across a milestone boundary.
 */
function refreshGoalProjection(
  goal: CompassGoalRow,
  args: {
    currentMilestoneProgress: number;
    today: string;
    lastReportedDate?: string | null;
  },
): void {
  if (!goal.startDate || !goal.targetDate || !goal.estimatedMilestones) return;
  const track = computeGoalTrack({
    startDate: goal.startDate,
    targetDate: goal.targetDate,
    estimatedMilestones: goal.estimatedMilestones,
    completedMilestones: completedMilestonesFor(goal.id).length,
    currentMilestoneProgress: args.currentMilestoneProgress,
    today: args.today,
    lastReportedDate: args.lastReportedDate,
  });
  db.update(compassGoals)
    .set({ currentProjectedDate: track.currentProjectedDate })
    .where(eq(compassGoals.id, goal.id))
    .run();
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

      const completedMilestones = db
        .select()
        .from(compassMilestones)
        .where(
          and(eq(compassMilestones.goalId, goal.id), eq(compassMilestones.status, 'completed')),
        )
        .orderBy(desc(compassMilestones.sortOrder))
        .all();
      lastCompletedMilestone = completedMilestones[0] ?? null;

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
        telemetry = buildTelemetry(
          { ...goal, completedMilestones: completedMilestones.length },
          milestone,
          compassDay,
        );
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

  finalizeSetup: async ({
    proposal,
    milestoneTargetDate,
    goalTargetDate,
    goalTitle,
    milestoneTitle,
    estimatedEffortUnits,
  }) => {
    const now = new Date().toISOString();
    const startDate = currentCompassDay();
    if (daysBetween(startDate, milestoneTargetDate) <= 0) {
      set({ error: 'The milestone date must be after today.' });
      return false;
    }

    let goal = get().goal;

    // A milestone may never outlive the goal it serves. This has to guard every
    // milestone, not just the first: the check used to sit inside the
    // goal-creation branch, so milestone two onwards could be dated past the
    // goal's own deadline — a state updateTargetDates would refuse to create.
    const effectiveGoalDate = goal?.targetDate ?? goalTargetDate;
    if (effectiveGoalDate && daysBetween(milestoneTargetDate, effectiveGoalDate) < 0) {
      set({
        error: goal
          ? "This milestone is due after the goal's own target date."
          : 'The goal date cannot be before the milestone date.',
      });
      return false;
    }

    if (!goal) {
      if (!goalTargetDate) {
        set({ error: 'Pick a target date for the goal.' });
        return false;
      }
      const goalId = createId('cgoal');
      db.insert(compassGoals)
        .values({
          id: goalId,
          title: goalTitle?.trim() || proposal.goalTitle,
          description: proposal.goalSummary,
          status: 'active',
          startDate,
          targetDate: goalTargetDate,
          estimatedMilestones: proposal.estimatedMilestones ?? 1,
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
        targetDate: milestoneTargetDate,
        originalEstimateDays: daysBetween(startDate, milestoneTargetDate),
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

  updateTargetDates: async ({ milestoneTargetDate, goalTargetDate }) => {
    const { goal, milestone } = get();
    if (!goal) return false;

    const today = currentCompassDay();
    if (milestoneTargetDate && daysBetween(today, milestoneTargetDate) <= 0) {
      set({ error: 'The milestone date must be after today.' });
      return false;
    }
    if (goalTargetDate && daysBetween(today, goalTargetDate) <= 0) {
      set({ error: 'The goal date must be after today.' });
      return false;
    }

    // Validate both dates together against whichever one isn't being changed
    // right now — editing just one field independently (the only path this
    // action supports) must not leave the goal's own deadline earlier than
    // its current milestone's, the same invariant finalizeSetup enforces.
    const effectiveMilestoneDate = milestoneTargetDate ?? milestone?.targetDate ?? null;
    const effectiveGoalDate = goalTargetDate ?? goal.targetDate ?? null;
    if (
      effectiveMilestoneDate &&
      effectiveGoalDate &&
      daysBetween(effectiveMilestoneDate, effectiveGoalDate) < 0
    ) {
      set({ error: 'The goal date cannot be before the milestone date.' });
      return false;
    }

    if (milestoneTargetDate && milestone) {
      db.update(compassMilestones)
        .set({
          targetDate: milestoneTargetDate,
          originalEstimateDays: daysBetween(milestone.startDate, milestoneTargetDate),
        })
        .where(eq(compassMilestones.id, milestone.id))
        .run();
    }

    if (goalTargetDate) {
      // Backfill a missing startDate from the earliest milestone rather than
      // from today: defaulting to today would reset the goal's elapsed clock and
      // make an old goal's projection read far more optimistic than it is.
      const startDate =
        goal.startDate ??
        earliestYmd(
          db
            .select({ startDate: compassMilestones.startDate })
            .from(compassMilestones)
            .where(eq(compassMilestones.goalId, goal.id))
            .all()
            .map((m) => m.startDate),
        ) ??
        today;
      db.update(compassGoals)
        .set({ targetDate: goalTargetDate, startDate })
        .where(eq(compassGoals.id, goal.id))
        .run();
    }

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
      // This night check-in IS the newest data point, so it becomes the anchor
      // the pace is measured to from here on.
      const { projectedDate } = computeProjection({
        completedUnits: completedEffortUnits,
        estimatedUnits: milestone.estimatedEffortUnits,
        startDate: milestone.startDate,
        today: compassDay,
        lastReportedDate: compassDay,
      });
      db.update(compassMilestones)
        .set({
          completedEffortUnits,
          currentProjectedDate: projectedDate,
          lastReportedDate: compassDay,
        })
        .where(eq(compassMilestones.id, milestone.id))
        .run();

      // Keep the goal's own projection in step with the milestone that just moved.
      refreshGoalProjection(goal, {
        currentMilestoneProgress: computeProgress(
          completedEffortUnits,
          milestone.estimatedEffortUnits,
        ),
        today: compassDay,
        lastReportedDate: compassDay,
      });

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
    const { goal, milestone } = get();
    if (!milestone) return;

    const today = currentCompassDay();
    completeMilestoneRow(milestone, today);

    // The goal just gained a whole milestone, so its projection moved too. The
    // next milestone has no progress yet, hence 0.
    if (goal) {
      refreshGoalProjection(goal, {
        currentMilestoneProgress: 0,
        today,
        lastReportedDate: milestone.lastReportedDate,
      });
    }

    // The GOAL is still active — completing a milestone just means the next
    // one needs planning. Reminders are scoped to the goal, not the
    // milestone, so they must stay on or the driver gets zero nudge to come
    // back and the goal quietly stalls.
    const { compassMorningTime, compassNightTime } = useSettingsStore.getState();
    await syncCompassReminders({
      morningTime: compassMorningTime,
      nightTime: compassNightTime,
      hasActiveGoal: true,
    });

    await get().loadCompass();
  },

  archiveGoal: async () => {
    const { goal, milestone } = get();
    if (!goal) return;

    const today = currentCompassDay();

    // Close out a final milestone whose steps are all logged. It is finished by
    // the only measure the app can verify, and the driver should not lose the
    // rank they earned because "mark complete" lives on a different card.
    if (milestone && isMilestoneFullyStepped(milestone)) {
      completeMilestoneRow(milestone, today);
    }

    const completedRows = completedMilestonesFor(goal.id);
    const completedMilestones = completedRows.length;
    const completed = isGoalComplete(completedMilestones, goal.estimatedMilestones);

    // Date the finish by when the work actually landed, not by when archive was
    // tapped. Archiving weeks after finishing on time used to grade as a C, and
    // that C is fed back into future sizing through the journey note below.
    const finishDate = latestYmd(completedRows.map((m) => m.actualCompletedDate)) ?? today;
    // Only a goal that actually reached its planned scope earns a rank —
    // archiving early to quit isn't a finish, so it isn't graded as one.
    const finalVarianceDays =
      completed && goal.targetDate ? computeFinalVarianceDays(goal.targetDate, finishDate) : null;
    const rank = completed ? deriveGoalRank(finalVarianceDays) : null;

    db.update(compassGoals)
      .set({
        status: 'archived',
        completedAt: new Date().toISOString(),
        rank,
        finalVarianceDays,
      })
      .where(eq(compassGoals.id, goal.id))
      .run();

    saveGoalFinishedNote(goal.id, goal.title, {
      completed,
      rank,
      varianceDays: finalVarianceDays,
      completedMilestones,
      estimatedMilestones: goal.estimatedMilestones,
    });

    const { compassMorningTime, compassNightTime } = useSettingsStore.getState();
    await syncCompassReminders({
      morningTime: compassMorningTime,
      nightTime: compassNightTime,
      hasActiveGoal: false,
    });

    set({ error: null });
    await get().loadCompass();
  },

  clearError: () => set({ error: null }),
}));
