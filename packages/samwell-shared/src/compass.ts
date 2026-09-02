import { z } from 'zod';

/**
 * Compass wire contract, shared by the app and the cloud server.
 *
 * The domain is Goal → Trackable → Schedule → Measurement → Log → Consistency.
 * A goal is the outcome; a trackable is the smallest thing that can be logged;
 * a schedule says when it is expected; a measurement says what counts as done;
 * a log says what happened. Consistency is derived from those and is never
 * stored, and there are no streaks anywhere in the model.
 *
 * ## Why every concept has two schemas
 *
 * The response schemas double as the LLM structured-output schemas
 * (`chat({ outputSchema })`), and strict `json_schema` requires every key to be
 * present — which is why LLM-facing fields use `.nullable()` rather than
 * `.optional()`. A discriminated union makes that worse: it asks the model to
 * pick a shape *and* omit the keys of the shapes it did not pick, which it does
 * unreliably, and a single stray key throws away an otherwise perfect goal.
 *
 * So each of Schedule and Measurement exists twice:
 *
 * - **Strict** (`ScheduleSchema`) — a real discriminated union. What the client
 *   validates, what the database stores, what the engines read.
 * - **Model** (`ScheduleModelSchema`) — one flat object with every key present
 *   and nullable. What the model is asked for.
 *
 * `normalizeGoalProposal` is the bridge: it drops the keys that do not belong
 * to the chosen variant, fills in what the model left out, clamps what it got
 * wrong, and downgrades a variant it cannot rescue rather than failing the
 * turn. A good conversation should not die on one bad field.
 */

// ── Enums ────────────────────────────────────────────────────────────────────

export const GOAL_CATEGORIES = [
  'HEALTH',
  'FITNESS',
  'LEARNING',
  'CAREER',
  'BUSINESS',
  'FINANCE',
  'CREATIVE',
  'PERSONAL',
  'RELATIONSHIPS',
  'OTHER',
] as const;
export type GoalCategory = (typeof GOAL_CATEGORIES)[number];

export const GOAL_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type GoalPriority = (typeof GOAL_PRIORITIES)[number];

/** Shared by goals and trackables — they move through the same four states. */
export const LIFECYCLE_STATUSES = ['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'] as const;
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];

export const SCHEDULE_TYPES = [
  'DAILY',
  'WEEKLY_DAYS',
  'WEEKLY_TARGET',
  'MONTHLY_TARGET',
  'SPECIFIC_DATES',
  'INTERVAL',
] as const;
export type ScheduleType = (typeof SCHEDULE_TYPES)[number];

export const MEASUREMENT_TYPES = [
  'COMPLETION',
  'QUANTITY',
  'DURATION',
  'AMOUNT',
  'RATING',
] as const;
export type MeasurementType = (typeof MEASUREMENT_TYPES)[number];

// ── Schedule ─────────────────────────────────────────────────────────────────

const YmdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

/** 0 = Sunday, matching `Date#getDay()` and the app's weekday rows. */
const DayOfWeekSchema = z.number().int().min(0).max(6);

const TimezoneSchema = z.string().min(1).max(64);

export const ScheduleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('DAILY'), timezone: TimezoneSchema }),
  z.object({
    type: z.literal('WEEKLY_DAYS'),
    daysOfWeek: z.array(DayOfWeekSchema).min(1).max(7),
    timezone: TimezoneSchema,
  }),
  z.object({
    type: z.literal('WEEKLY_TARGET'),
    target: z.number().int().min(1).max(7),
    timezone: TimezoneSchema,
  }),
  z.object({
    type: z.literal('MONTHLY_TARGET'),
    target: z.number().int().min(1).max(31),
    timezone: TimezoneSchema,
  }),
  z.object({
    type: z.literal('SPECIFIC_DATES'),
    dates: z.array(YmdSchema).min(1).max(200),
    timezone: TimezoneSchema,
  }),
  z.object({
    type: z.literal('INTERVAL'),
    intervalDays: z.number().int().min(1).max(365),
    timezone: TimezoneSchema,
  }),
]);
export type Schedule = z.infer<typeof ScheduleSchema>;

/** The flat shape the model is asked for. Every key present, every key nullable. */
export const ScheduleModelSchema = z.object({
  type: z.enum(SCHEDULE_TYPES),
  daysOfWeek: z.array(z.number()).nullable(),
  target: z.number().nullable(),
  dates: z.array(z.string()).nullable(),
  intervalDays: z.number().nullable(),
});
export type ScheduleModel = z.infer<typeof ScheduleModelSchema>;

// ── Measurement ──────────────────────────────────────────────────────────────

export const MeasurementSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('COMPLETION') }),
  z.object({
    type: z.literal('QUANTITY'),
    target: z.number().positive(),
    unit: z.string().min(1).max(32),
  }),
  z.object({
    type: z.literal('DURATION'),
    target: z.number().positive(),
    unit: z.enum(['minutes', 'hours']),
  }),
  z.object({
    type: z.literal('AMOUNT'),
    target: z.number().positive(),
    unit: z.string().min(1).max(32),
  }),
  z.object({
    type: z.literal('RATING'),
    min: z.number().int(),
    max: z.number().int(),
  }),
]);
export type Measurement = z.infer<typeof MeasurementSchema>;

export const MeasurementModelSchema = z.object({
  type: z.enum(MEASUREMENT_TYPES),
  target: z.number().nullable(),
  unit: z.string().nullable(),
  min: z.number().nullable(),
  max: z.number().nullable(),
});
export type MeasurementModel = z.infer<typeof MeasurementModelSchema>;

// ── Reading context (unchanged: the library is what makes this Open Citadel) ──

export const CompassReadingRefSchema = z.object({
  kind: z.enum(['highlight', 'note', 'thought']),
  text: z.string().min(1).max(500),
  bookTitle: z.string().nullable(),
  author: z.string().nullable(),
});
export type CompassReadingRef = z.infer<typeof CompassReadingRefSchema>;

const ReadingContextSchema = z.array(CompassReadingRefSchema).max(12).optional();

export const CompassChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(4000),
});
export type CompassChatMessage = z.infer<typeof CompassChatMessageSchema>;

const ChatMessagesSchema = z.array(CompassChatMessageSchema).min(1).max(40);

// ── The proposal ─────────────────────────────────────────────────────────────

/**
 * Five is the hard cap, and it is structural rather than advisory.
 *
 * The prompt asks for the fewest trackables that can carry the goal, but a
 * model that ignores that produces a system nobody can log daily, which is the
 * single most likely way this feature fails a real user. The model schema
 * allows more so an over-eager response still parses; the normalizer then
 * takes the first five.
 */
export const MAX_TRACKABLES = 5;

/**
 * Durations, not dates.
 *
 * Models are unreliable at "what date is six weeks from Tuesday", and there is
 * no reason to make them try — the client knows what today is and can do exact
 * arithmetic. `startOffsetDays` counts from the goal's start; a null
 * `durationDays` means the trackable runs to the end of the goal.
 * SPECIFIC_DATES is the one place real dates are unavoidable, and the
 * normalizer drops any that fall outside the resolved window.
 */
const TrackableProposalCore = {
  title: z.string().min(1).max(120),
  description: z.string().max(500).nullable(),
  startOffsetDays: z.number().int().min(0).max(3650),
  durationDays: z.number().int().min(1).max(3650).nullable(),
  /** `HH:MM`, 24-hour. Display and ordering only — it never gates a log. */
  timeOfDay: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:MM')
    .nullable(),
};

export const TrackableProposalSchema = z.object({
  ...TrackableProposalCore,
  schedule: ScheduleSchema,
  measurement: MeasurementSchema,
});
export type TrackableProposal = z.infer<typeof TrackableProposalSchema>;

const TrackableProposalModelSchema = z.object({
  ...TrackableProposalCore,
  schedule: ScheduleModelSchema,
  measurement: MeasurementModelSchema,
});

const GoalProposalCore = {
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(600),
  category: z.enum(GOAL_CATEGORIES),
  priority: z.enum(GOAL_PRIORITIES),
  durationDays: z.number().int().min(1).max(3650),
  /**
   * The numeric outcome, when the goal has one: "$4,000", "10kg".
   *
   * This is what makes the execution/outcome split expressible at all — being
   * 92% consistent and being $1,200 into $4,000 are different facts and the
   * spec is emphatic that they must not be averaged into one number. Null for
   * a goal that is purely behavioural, like showering cold for a year.
   */
  outcomeTarget: z.number().positive().nullable(),
  outcomeUnit: z.string().min(1).max(32).nullable(),
  rationale: z.string().max(1000).nullable(),
};

export const GoalProposalSchema = z.object({
  ...GoalProposalCore,
  trackables: z.array(TrackableProposalSchema).min(1).max(MAX_TRACKABLES),
});
export type GoalProposal = z.infer<typeof GoalProposalSchema>;

const GoalProposalModelSchema = z.object({
  ...GoalProposalCore,
  trackables: z.array(TrackableProposalModelSchema).min(1).max(10),
});

// ── Plan turn (the goal brainstorm) ──────────────────────────────────────────

export const CompassPlanTurnRequestSchema = z.object({
  messages: ChatMessagesSchema,
  modelId: z.string().optional(),
  context: z.object({
    today: YmdSchema,
    timezone: TimezoneSchema,
  }),
  existingGoal: z
    .object({
      title: z.string(),
      summary: z.string().nullable(),
    })
    .optional(),
  readingContext: ReadingContextSchema,
  journey: z.string().max(4000).optional(),
});
export type CompassPlanTurnRequest = z.infer<typeof CompassPlanTurnRequestSchema>;

export const CompassPlanTurnSchema = z.object({
  reply: z.string().min(1),
  draft: GoalProposalSchema.nullable(),
});
export type CompassPlanTurn = z.infer<typeof CompassPlanTurnSchema>;

export const CompassPlanTurnModelSchema = z.object({
  reply: z.string().min(1),
  draft: GoalProposalModelSchema.nullable(),
});
export type CompassPlanTurnModel = z.infer<typeof CompassPlanTurnModelSchema>;

// ── Check-in turn ────────────────────────────────────────────────────────────

export const ADJUSTMENT_ACTIONS = ['PAUSE', 'RESUME', 'RETARGET', 'RETIRE'] as const;
export type AdjustmentAction = (typeof ADJUSTMENT_ACTIONS)[number];

/**
 * A change to an existing trackable, proposed in a check-in and approved the
 * same way a goal is.
 *
 * Deliberately flat and deliberately small. The check-in's job is to talk, and
 * a large nested object here buys nothing — a goal that needs restructuring
 * wants a plan conversation, not a check-in that quietly rewrites it. History
 * keeps the old value, so consistency before an adjustment is never rewritten
 * by one.
 */
export const AdjustmentSchema = z.object({
  trackableId: z.string().min(1),
  action: z.enum(ADJUSTMENT_ACTIONS),
  /** Only meaningful for RETARGET: the new schedule target or measurement target. */
  target: z.number().nullable(),
  reason: z.string().min(1).max(400),
});
export type Adjustment = z.infer<typeof AdjustmentSchema>;

export const MAX_ADJUSTMENTS = 3;

/** What the client tells the server about how the goal is actually going. */
export const CompassCheckinContextSchema = z.object({
  today: YmdSchema,
  timezone: TimezoneSchema,
  goalTitle: z.string(),
  goalSummary: z.string().nullable(),
  startDate: YmdSchema,
  endDate: YmdSchema,
  daysRemaining: z.number().int(),
  /** 0..1, or null when nothing has been expected yet. Never 0 on day one. */
  executionRatio: z.number().min(0).max(1).nullable(),
  outcome: z
    .object({
      value: z.number(),
      target: z.number(),
      unit: z.string(),
    })
    .nullable(),
  trackables: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        status: z.enum(LIFECYCLE_STATUSES),
        scheduleSummary: z.string(),
        expected: z.number().int(),
        completed: z.number().int(),
        ratio: z.number().min(0).max(1).nullable(),
      }),
    )
    .max(MAX_TRACKABLES),
  /**
   * The journal: what the user wrote when they logged, wins and misses alike.
   *
   * This is the material the conversation is actually about. A miss that says
   * "editing is the bottleneck" three weeks running is a workflow problem, and
   * only the notes can say so.
   */
  recentNotes: z
    .array(
      z.object({
        date: YmdSchema,
        trackableTitle: z.string(),
        completed: z.boolean(),
        note: z.string().max(1000),
      }),
    )
    .max(30),
});
export type CompassCheckinContext = z.infer<typeof CompassCheckinContextSchema>;

export const CompassCheckinTurnRequestSchema = z.object({
  messages: ChatMessagesSchema,
  modelId: z.string().optional(),
  context: CompassCheckinContextSchema,
  readingContext: ReadingContextSchema,
  journey: z.string().max(4000).optional(),
});
export type CompassCheckinTurnRequest = z.infer<typeof CompassCheckinTurnRequestSchema>;

export const CompassCheckinDraftSchema = z.object({
  /** One line worth remembering, distilled. Feeds `journeyNotes`. */
  journeyNote: z.string().max(300).nullable(),
  adjustments: z.array(AdjustmentSchema).max(MAX_ADJUSTMENTS),
});
export type CompassCheckinDraft = z.infer<typeof CompassCheckinDraftSchema>;

export const CompassCheckinTurnSchema = z.object({
  reply: z.string().min(1),
  draft: CompassCheckinDraftSchema.nullable(),
});
export type CompassCheckinTurn = z.infer<typeof CompassCheckinTurnSchema>;

const CompassCheckinDraftModelSchema = z.object({
  journeyNote: z.string().nullable(),
  adjustments: z.array(AdjustmentSchema).max(10),
});

export const CompassCheckinTurnModelSchema = z.object({
  reply: z.string().min(1),
  draft: CompassCheckinDraftModelSchema.nullable(),
});
export type CompassCheckinTurnModel = z.infer<typeof CompassCheckinTurnModelSchema>;

// ── Normalization: loose model output → strict wire shape ────────────────────

export type NormalizeContext = { today: string; timezone: string };

function clampInt(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.round(value)));
}

function isYmd(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Rescue a schedule, or fall back to DAILY.
 *
 * Downgrading beats failing. A WEEKLY_DAYS with no days is not a schedule, but
 * the rest of the proposal around it is usually fine, and DAILY is the honest
 * reading of "do this regularly" — the user can correct it in one tap, where a
 * rejected turn costs them the whole conversation.
 */
export function normalizeSchedule(raw: ScheduleModel, ctx: NormalizeContext): Schedule {
  const timezone = ctx.timezone;

  switch (raw.type) {
    case 'WEEKLY_DAYS': {
      const days = Array.from(
        new Set((raw.daysOfWeek ?? []).map((d) => Math.round(d)).filter((d) => d >= 0 && d <= 6)),
      ).sort((a, b) => a - b);
      if (days.length === 0) return { type: 'DAILY', timezone };
      return { type: 'WEEKLY_DAYS', daysOfWeek: days, timezone };
    }
    case 'WEEKLY_TARGET': {
      if (raw.target == null) return { type: 'DAILY', timezone };
      return { type: 'WEEKLY_TARGET', target: clampInt(raw.target, 1, 7), timezone };
    }
    case 'MONTHLY_TARGET': {
      if (raw.target == null) return { type: 'DAILY', timezone };
      return { type: 'MONTHLY_TARGET', target: clampInt(raw.target, 1, 31), timezone };
    }
    case 'SPECIFIC_DATES': {
      const dates = Array.from(new Set((raw.dates ?? []).filter(isYmd))).sort().slice(0, 200);
      if (dates.length === 0) return { type: 'DAILY', timezone };
      return { type: 'SPECIFIC_DATES', dates, timezone };
    }
    case 'INTERVAL': {
      if (raw.intervalDays == null) return { type: 'DAILY', timezone };
      const days = clampInt(raw.intervalDays, 1, 365);
      // Every 1 day IS daily, and saying so keeps one representation per meaning.
      if (days === 1) return { type: 'DAILY', timezone };
      return { type: 'INTERVAL', intervalDays: days, timezone };
    }
    case 'DAILY':
    default:
      return { type: 'DAILY', timezone };
  }
}

const DEFAULT_RATING_MIN = 1;
const DEFAULT_RATING_MAX = 5;

/**
 * Rescue a measurement, or fall back to COMPLETION.
 *
 * COMPLETION is the safe floor for the same reason DAILY is: "did it happen"
 * is always answerable, so a trackable that lands there is still loggable.
 */
export function normalizeMeasurement(raw: MeasurementModel): Measurement {
  switch (raw.type) {
    case 'QUANTITY':
    case 'AMOUNT': {
      const target = raw.target;
      const unit = raw.unit?.trim();
      if (target == null || target <= 0 || !unit) return { type: 'COMPLETION' };
      return { type: raw.type, target, unit: unit.slice(0, 32) };
    }
    case 'DURATION': {
      const target = raw.target;
      if (target == null || target <= 0) return { type: 'COMPLETION' };
      const unit = raw.unit === 'hours' ? 'hours' : 'minutes';
      return { type: 'DURATION', target, unit };
    }
    case 'RATING': {
      const min = raw.min == null ? DEFAULT_RATING_MIN : Math.round(raw.min);
      const max = raw.max == null ? DEFAULT_RATING_MAX : Math.round(raw.max);
      if (max <= min) return { type: 'RATING', min: DEFAULT_RATING_MIN, max: DEFAULT_RATING_MAX };
      return { type: 'RATING', min, max };
    }
    case 'COMPLETION':
    default:
      return { type: 'COMPLETION' };
  }
}

export function normalizeCompassPlanTurn(
  turn: CompassPlanTurnModel,
  ctx: NormalizeContext,
): CompassPlanTurn {
  if (turn.draft === null) return { reply: turn.reply, draft: null };

  const draft = turn.draft;
  const trackables = draft.trackables.slice(0, MAX_TRACKABLES).map((t) => ({
    title: t.title,
    description: t.description,
    startOffsetDays: t.startOffsetDays,
    durationDays: t.durationDays,
    timeOfDay: t.timeOfDay,
    schedule: normalizeSchedule(t.schedule, ctx),
    measurement: normalizeMeasurement(t.measurement),
  }));

  // An outcome needs both halves to mean anything; half of one is noise.
  const hasOutcome = draft.outcomeTarget != null && draft.outcomeUnit != null;

  return {
    reply: turn.reply,
    draft: {
      title: draft.title,
      summary: draft.summary,
      category: draft.category,
      priority: draft.priority,
      durationDays: draft.durationDays,
      outcomeTarget: hasOutcome ? draft.outcomeTarget : null,
      outcomeUnit: hasOutcome ? draft.outcomeUnit : null,
      rationale: draft.rationale,
      trackables,
    },
  };
}

export function normalizeCompassCheckinTurn(
  turn: CompassCheckinTurnModel,
  knownTrackableIds: readonly string[],
): CompassCheckinTurn {
  if (turn.draft === null) return { reply: turn.reply, draft: null };

  const known = new Set(knownTrackableIds);
  // A proposal against a trackable that does not exist cannot be approved, and
  // showing it would offer the user a button that does nothing.
  const adjustments = turn.draft.adjustments
    .filter((a) => known.has(a.trackableId))
    .slice(0, MAX_ADJUSTMENTS);

  const journeyNote = turn.draft.journeyNote?.slice(0, 300) ?? null;

  // A draft with nothing left in it is not a draft.
  if (adjustments.length === 0 && !journeyNote) return { reply: turn.reply, draft: null };

  return { reply: turn.reply, draft: { journeyNote, adjustments } };
}
