import type {
  CompassAction,
  CompassAlignment,
  CompassCategory,
  CompassGoalTrack,
  CompassMissionStep,
  CompassScheduleStatus,
  CompassTelemetry,
} from 'samwell-shared';

/**
 * All deterministic Compass math lives here, on-device. The LLM only extracts
 * and classifies; scores, projections, and variances are computed from its
 * output so the numbers the driver sees are exact and reproducible.
 * Pure TypeScript — no React Native, no DB imports.
 */

export const ALIGNMENT_WEIGHTS: Record<CompassAlignment, number> = {
  directly_aligned: 1.0,
  supportive: 0.75,
  weakly_aligned: 0.4,
  distraction: 0,
  unclear: 0.2,
};

const MAINTENANCE_WEIGHT = 0.3;

export function actionWeight(action: {
  category: CompassCategory;
  alignment: CompassAlignment;
}): number {
  if (action.category === 'maintenance') return MAINTENANCE_WEIGHT;
  return ALIGNMENT_WEIGHTS[action.alignment];
}

/**
 * 0-100. Weighted by minutes when every action has a positive time estimate,
 * otherwise an unweighted mean of alignment weights.
 */
export function computeFocusScore(
  actions: Pick<CompassAction, 'category' | 'alignment' | 'minutes'>[],
): number {
  if (actions.length === 0) return 0;

  const allTimed = actions.every((a) => typeof a.minutes === 'number' && a.minutes > 0);
  let score: number;
  if (allTimed) {
    const totalMinutes = actions.reduce((sum, a) => sum + (a.minutes as number), 0);
    const weighted = actions.reduce(
      (sum, a) => sum + actionWeight(a) * (a.minutes as number),
      0,
    );
    score = (weighted / totalMinutes) * 100;
  } else {
    const weighted = actions.reduce((sum, a) => sum + actionWeight(a), 0);
    score = (weighted / actions.length) * 100;
  }

  return Math.min(100, Math.max(0, Math.round(score)));
}

// ── Local calendar dates (YYYY-MM-DD) ────────────────────────────────────────

export function todayLocalYmd(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseYmd(ymd: string): { year: number; month: number; day: number } {
  const [year, month, day] = ymd.split('-').map(Number);
  return { year, month, day };
}

/** Calendar-day difference (to - from). Uses Date.UTC so DST cannot skew it. */
export function daysBetween(fromYmd: string, toYmd: string): number {
  const from = parseYmd(fromYmd);
  const to = parseYmd(toYmd);
  const fromMs = Date.UTC(from.year, from.month - 1, from.day);
  const toMs = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((toMs - fromMs) / 86_400_000);
}

export function addDaysYmd(ymd: string, days: number): string {
  const { year, month, day } = parseYmd(ymd);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ── Personal day boundary ────────────────────────────────────────────────────

function parseHhMm(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * The driver's day does not roll over at midnight — it rolls over at the
 * midpoint between their night and morning check-in times (wrapping midnight),
 * so a 00:30 night report from a 09:00/00:00 night owl still counts for the
 * day that just ended. Before the boundary, the compass day is yesterday.
 */
export function compassDayFor(now: Date, morningTime: string, nightTime: string): string {
  const morning = parseHhMm(morningTime);
  const night = parseHhMm(nightTime);

  // Minutes from night to morning going forward across midnight.
  const gap = (morning - night + 1440) % 1440;
  const boundary = (night + Math.floor(gap / 2)) % 1440;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const today = todayLocalYmd(now);
  return nowMinutes < boundary ? addDaysYmd(today, -1) : today;
}

/**
 * Which check-in is available right now. Before the night time (and after the
 * day boundary) the driver plans the day ahead, so morning is open; from the
 * night time until the boundary they review, so night is open. This is what
 * stops a "morning" plan being logged at 23:53 — by then it is the night window.
 */
export function activeCheckin(
  now: Date,
  morningTime: string,
  nightTime: string,
): 'morning' | 'night' {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const morning = parseHhMm(morningTime);
  const night = parseHhMm(nightTime);
  const gap = (morning - night + 1440) % 1440; // forward from night to morning
  const nightWindow = Math.floor(gap / 2); // night runs from night time to the boundary
  const fromNight = (nowMinutes - night + 1440) % 1440;
  return fromNight < nightWindow ? 'night' : 'morning';
}

// ── Progress & projection ────────────────────────────────────────────────────

export function computeProgress(completedUnits: number, estimatedUnits: number): number {
  if (estimatedUnits <= 0) return 0;
  return Math.min(1, Math.max(0, completedUnits / estimatedUnits));
}

export function computeProjection(input: {
  completedUnits: number;
  estimatedUnits: number;
  startDate: string;
  today: string;
}): { projectedDate: string | null; avgDailyUnits: number | null } {
  const daysElapsed = daysBetween(input.startDate, input.today) + 1;
  if (daysElapsed < 2 || input.completedUnits <= 0) {
    return { projectedDate: null, avgDailyUnits: null };
  }

  const avgDailyUnits = input.completedUnits / daysElapsed;
  const remainingUnits = Math.max(0, input.estimatedUnits - input.completedUnits);
  const projectedRemainingDays = Math.ceil(remainingUnits / avgDailyUnits);
  return {
    projectedDate: addDaysYmd(input.today, projectedRemainingDays),
    avgDailyUnits,
  };
}

/** Positive variance = behind the original target. Within a day = on track. */
export function computeScheduleStatus(
  targetDate: string,
  projectedDate: string | null,
): { status: CompassScheduleStatus; varianceDays: number | null } {
  if (!projectedDate) return { status: 'unknown', varianceDays: null };
  const varianceDays = daysBetween(targetDate, projectedDate);
  if (Math.abs(varianceDays) <= 1) return { status: 'on_track', varianceDays };
  return { status: varianceDays > 0 ? 'behind' : 'ahead', varianceDays };
}

export function computeFinalVarianceDays(
  targetDate: string,
  actualCompletedDate: string,
): number {
  return daysBetween(targetDate, actualCompletedDate);
}

/**
 * A goal only earns a rank when it actually reached its planned scope —
 * determined from completed-milestone count, not self-report, so archiving
 * early to quit can't be relabeled as an "early finish" for a free A.
 */
export function isGoalComplete(
  completedMilestones: number,
  estimatedMilestones: number | null,
): boolean {
  return estimatedMilestones != null && completedMilestones >= estimatedMilestones;
}

/**
 * A/B/C rank for an archived goal, from its final variance vs the original
 * target. Same ±1-day "on track" tolerance as computeScheduleStatus, so the
 * grade agrees with whatever pace verdict the driver saw along the way.
 */
export function deriveGoalRank(varianceDays: number | null): 'A' | 'B' | 'C' | null {
  if (varianceDays == null) return null;
  if (Math.abs(varianceDays) <= 1) return 'B';
  return varianceDays < 0 ? 'A' : 'C';
}

/**
 * Defensive sort for today's mission steps. `order` only exists on rows
 * generated after it was added to the schema, so it's only trusted as a sort
 * key when every step in the array has one — historical rows without it keep
 * whatever order they were originally rendered in.
 */
export function orderMissionSteps(mission: CompassMissionStep[]): CompassMissionStep[] {
  if (!mission.every((step) => step.order != null)) return mission;
  return [...mission].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

// ── Goal-level race ──────────────────────────────────────────────────────────

/**
 * The goal's own projection, one level above the milestone. Progress is counted
 * in fractional MILESTONES rather than steps, because each milestone defines its
 * own kind of step ("1 chapter outlined" then "1 chapter written") and those
 * cannot be summed. Milestones are comparable, so the goal races in those.
 */
export function computeGoalTrack(input: {
  startDate: string;
  targetDate: string;
  estimatedMilestones: number;
  completedMilestones: number;
  /** The active milestone's own progress, 0..1. */
  currentMilestoneProgress: number;
  today: string;
}): CompassGoalTrack {
  const estimatedMilestones = Math.max(1, input.estimatedMilestones);
  const milestonesDone = Math.min(
    estimatedMilestones,
    input.completedMilestones + Math.min(1, Math.max(0, input.currentMilestoneProgress)),
  );

  const { projectedDate } = computeProjection({
    completedUnits: milestonesDone,
    estimatedUnits: estimatedMilestones,
    startDate: input.startDate,
    today: input.today,
  });
  const { status, varianceDays } = computeScheduleStatus(input.targetDate, projectedDate);

  return {
    targetDate: input.targetDate,
    estimatedMilestones,
    completedMilestones: input.completedMilestones,
    milestonesDone,
    currentProjectedDate: projectedDate,
    daysRemaining: Math.max(0, daysBetween(input.today, input.targetDate)),
    scheduleStatus: status,
    varianceDays,
  };
}

// ── Telemetry context for the AI ─────────────────────────────────────────────

export function buildTelemetry(
  goal: {
    title: string;
    startDate?: string | null;
    targetDate?: string | null;
    estimatedMilestones?: number | null;
    completedMilestones?: number;
  },
  milestone: {
    title: string;
    effortUnitDefinition: string;
    estimatedEffortUnits: number;
    completedEffortUnits: number;
    startDate: string;
    targetDate: string;
  },
  today: string,
): CompassTelemetry {
  const { projectedDate, avgDailyUnits } = computeProjection({
    completedUnits: milestone.completedEffortUnits,
    estimatedUnits: milestone.estimatedEffortUnits,
    startDate: milestone.startDate,
    today,
  });
  const { status, varianceDays } = computeScheduleStatus(milestone.targetDate, projectedDate);

  const daysElapsed = daysBetween(milestone.startDate, today) + 1;
  const daysRemaining = Math.max(0, daysBetween(today, milestone.targetDate));
  const remainingUnits = Math.max(
    0,
    milestone.estimatedEffortUnits - milestone.completedEffortUnits,
  );
  const requiredDailyUnits =
    daysRemaining > 0 ? remainingUnits / daysRemaining : remainingUnits;

  const goalTrack =
    goal.startDate && goal.targetDate && goal.estimatedMilestones != null
      ? computeGoalTrack({
          startDate: goal.startDate,
          targetDate: goal.targetDate,
          estimatedMilestones: goal.estimatedMilestones,
          completedMilestones: goal.completedMilestones ?? 0,
          currentMilestoneProgress: computeProgress(
            milestone.completedEffortUnits,
            milestone.estimatedEffortUnits,
          ),
          today,
        })
      : null;

  return {
    goalTitle: goal.title,
    milestoneTitle: milestone.title,
    effortUnitDefinition: milestone.effortUnitDefinition,
    estimatedEffortUnits: milestone.estimatedEffortUnits,
    completedEffortUnits: milestone.completedEffortUnits,
    startDate: milestone.startDate,
    targetDate: milestone.targetDate,
    currentProjectedDate: projectedDate,
    today,
    daysElapsed,
    daysRemaining,
    avgDailyUnits,
    requiredDailyUnits,
    scheduleStatus: status,
    varianceDays,
    goalTrack,
  };
}
