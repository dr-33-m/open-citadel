import { z } from 'zod';

/**
 * Compass wire contract, shared by the app and the cloud server.
 * The response schemas double as the LLM structured-output schemas
 * (`chat({ outputSchema })`), so LLM-facing fields use `.nullable()`
 * rather than `.optional()` — strict json_schema requires every key.
 */

export const COMPASS_CATEGORIES = [
  'execution',
  'learning',
  'recovery',
  'admin',
  'maintenance',
  'distraction',
  'unclear',
] as const;
export type CompassCategory = (typeof COMPASS_CATEGORIES)[number];

export const COMPASS_ALIGNMENTS = [
  'directly_aligned',
  'supportive',
  'weakly_aligned',
  'distraction',
  'unclear',
] as const;
export type CompassAlignment = (typeof COMPASS_ALIGNMENTS)[number];

export const COMPASS_SCHEDULE_STATUSES = ['ahead', 'on_track', 'behind', 'unknown'] as const;
export type CompassScheduleStatus = (typeof COMPASS_SCHEDULE_STATUSES)[number];

export type CompassCheckinKind = 'morning' | 'night';

export const CompassActionSchema = z.object({
  description: z.string().min(1),
  category: z.enum(COMPASS_CATEGORIES),
  alignment: z.enum(COMPASS_ALIGNMENTS),
  minutes: z.number().int().min(0).nullable(),
  effortUnits: z.number().min(0).nullable(),
});
export type CompassAction = z.infer<typeof CompassActionSchema>;

/** Client-computed context sent with every check-in. Dates are local YYYY-MM-DD. */
export const CompassTelemetrySchema = z.object({
  goalTitle: z.string(),
  milestoneTitle: z.string(),
  effortUnitDefinition: z.string(),
  estimatedEffortUnits: z.number(),
  completedEffortUnits: z.number(),
  startDate: z.string(),
  targetDate: z.string(),
  currentProjectedDate: z.string().nullable(),
  today: z.string(),
  daysElapsed: z.number().int(),
  daysRemaining: z.number().int(),
  avgDailyUnits: z.number().nullable(),
  requiredDailyUnits: z.number(),
  scheduleStatus: z.enum(COMPASS_SCHEDULE_STATUSES),
  varianceDays: z.number().int().nullable(),
});
export type CompassTelemetry = z.infer<typeof CompassTelemetrySchema>;

/**
 * A passage from the driver's library: a book highlight, a note on one, or a
 * standalone thought. Sent per-request only — never stored server-side. The
 * engineer cites these when they sharpen the analysis; reading is the point
 * of Open Citadel, and Compass is where it gets applied.
 */
export const CompassReadingRefSchema = z.object({
  kind: z.enum(['highlight', 'note', 'thought']),
  text: z.string().min(1).max(500),
  bookTitle: z.string().nullable(),
  author: z.string().nullable(),
});
export type CompassReadingRef = z.infer<typeof CompassReadingRefSchema>;

const ReadingContextSchema = z.array(CompassReadingRefSchema).max(12).optional();

export const CompassSetupRequestSchema = z.object({
  description: z.string().min(1).max(4000),
  modelId: z.string().optional(),
  existingGoal: z
    .object({
      title: z.string(),
      description: z.string().nullable(),
    })
    .optional(),
  readingContext: ReadingContextSchema,
});
export type CompassSetupRequest = z.infer<typeof CompassSetupRequestSchema>;

export const CompassMorningRequestSchema = z.object({
  text: z.string().min(1).max(4000),
  modelId: z.string().optional(),
  telemetry: CompassTelemetrySchema,
  readingContext: ReadingContextSchema,
  journey: z.string().max(4000).optional(),
});
export type CompassMorningRequest = z.infer<typeof CompassMorningRequestSchema>;

export const CompassMorningPlanSchema = z.object({
  missionSummary: z.string(),
  actions: z.array(
    z.object({
      description: z.string(),
      category: z.enum(COMPASS_CATEGORIES),
      alignment: z.enum(COMPASS_ALIGNMENTS),
    }),
  ),
});
export type CompassMorningPlan = z.infer<typeof CompassMorningPlanSchema>;

export const CompassNightRequestSchema = z.object({
  text: z.string().min(1).max(4000),
  modelId: z.string().optional(),
  telemetry: CompassTelemetrySchema,
  morningPlan: CompassMorningPlanSchema.nullable(),
  readingContext: ReadingContextSchema,
  journey: z.string().max(4000).optional(),
});
export type CompassNightRequest = z.infer<typeof CompassNightRequestSchema>;

export const CompassSetupProposalSchema = z.object({
  goalTitle: z.string().min(1),
  goalSummary: z.string(),
  milestoneTitle: z.string().min(1),
  effortUnitDefinition: z.string().min(1),
  estimatedEffortUnits: z.number().positive(),
  rationale: z.string(),
});
export type CompassSetupProposal = z.infer<typeof CompassSetupProposalSchema>;

/**
 * The icon vocabulary Samwell may pick from for a mission step (generative UI:
 * he chooses, the app renders one of OUR icons). Every value maps to a
 * lucide-react-native icon in the app's mission-icon map; keep them in sync.
 */
export const COMPASS_MISSION_ICONS = [
  'video',
  'mic',
  'camera',
  'wrench',
  'hammer',
  'target',
  'book-open',
  'pencil',
  'pen',
  'search',
  'code',
  'dumbbell',
  'brain',
  'lightbulb',
  'clock',
  'check-circle',
  'flag',
  'zap',
  'list-checks',
  'message-square',
  'mail',
  'phone',
  'file-text',
  'image',
  'music',
  'trending-up',
  'coffee',
  'users',
  'calendar',
  'rocket',
  'star',
  'circle',
] as const;
export type CompassMissionIcon = (typeof COMPASS_MISSION_ICONS)[number];

export const CompassMissionStepSchema = z.object({
  title: z.string().min(1),
  detail: z.string(),
  icon: z.enum(COMPASS_MISSION_ICONS),
});
export type CompassMissionStep = z.infer<typeof CompassMissionStepSchema>;

export const CompassMorningAnalysisSchema = z.object({
  actions: z.array(CompassActionSchema).min(1),
  /** One short, punchy directive for today. Becomes the focus-card headline. */
  headline: z.string().min(1),
  /** Today's mission as 1-4 ordered steps, each rendered as a card with an icon. */
  mission: z.array(CompassMissionStepSchema).min(1).max(4),
  pitWallMessage: z.string().min(1),
});
export type CompassMorningAnalysis = z.infer<typeof CompassMorningAnalysisSchema>;

export const CompassNightAnalysisSchema = z.object({
  actions: z.array(CompassActionSchema).min(1),
  /** One short line: today's result and tomorrow's single focus. Focus-card headline. */
  headline: z.string().min(1),
  effortUnitsCompleted: z.number().min(0),
  pitWallMessage: z.string().min(1),
  /** One-line reflection on the journey's direction, or null if nothing notable today. */
  journeyNote: z.string().nullable(),
});
export type CompassNightAnalysis = z.infer<typeof CompassNightAnalysisSchema>;

// ── Conversational turns ─────────────────────────────────────────────────────
// Check-ins and goal setup are a back-and-forth: the driver and Grand Maester
// Samwell iterate in chat until they agree on a draft, then the driver approves
// it. Each turn sends the conversation so far plus current context; the engine
// returns a conversational `reply` and, once it has a concrete proposal, a
// structured `draft` (null while still clarifying). The driver finalizes; the
// engine never persists on its own.

export const CompassChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(4000),
});
export type CompassChatMessage = z.infer<typeof CompassChatMessageSchema>;

const ChatMessagesSchema = z.array(CompassChatMessageSchema).min(1).max(40);

export const CompassSetupTurnRequestSchema = z.object({
  messages: ChatMessagesSchema,
  modelId: z.string().optional(),
  existingGoal: z
    .object({
      title: z.string(),
      description: z.string().nullable(),
    })
    .optional(),
  readingContext: ReadingContextSchema,
});
export type CompassSetupTurnRequest = z.infer<typeof CompassSetupTurnRequestSchema>;

export const CompassMorningTurnRequestSchema = z.object({
  messages: ChatMessagesSchema,
  modelId: z.string().optional(),
  telemetry: CompassTelemetrySchema,
  readingContext: ReadingContextSchema,
  journey: z.string().max(4000).optional(),
});
export type CompassMorningTurnRequest = z.infer<typeof CompassMorningTurnRequestSchema>;

export const CompassNightTurnRequestSchema = z.object({
  messages: ChatMessagesSchema,
  modelId: z.string().optional(),
  telemetry: CompassTelemetrySchema,
  morningPlan: CompassMorningPlanSchema.nullable(),
  readingContext: ReadingContextSchema,
  journey: z.string().max(4000).optional(),
});
export type CompassNightTurnRequest = z.infer<typeof CompassNightTurnRequestSchema>;

export const CompassSetupTurnSchema = z.object({
  reply: z.string().min(1),
  draft: CompassSetupProposalSchema.nullable(),
});
export type CompassSetupTurn = z.infer<typeof CompassSetupTurnSchema>;

export const CompassMorningTurnSchema = z.object({
  reply: z.string().min(1),
  draft: CompassMorningAnalysisSchema.nullable(),
});
export type CompassMorningTurn = z.infer<typeof CompassMorningTurnSchema>;

export const CompassNightTurnSchema = z.object({
  reply: z.string().min(1),
  draft: CompassNightAnalysisSchema.nullable(),
});
export type CompassNightTurn = z.infer<typeof CompassNightTurnSchema>;
