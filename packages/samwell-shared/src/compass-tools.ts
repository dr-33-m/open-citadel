import { toolDefinition } from '@tanstack/ai/client';
import { z } from 'zod';

import { CompassCheckinDraftModelSchema, GoalProposalModelSchema } from './compass';
import {
  searchHighlightsTool,
  searchJourneyTool,
  searchReadingTool,
  searchThoughtsTool,
} from './tools';

/**
 * Compass as tools, not as a response format.
 *
 * Compass used to ask the model for a `{ reply, draft }` JSON document on
 * every single turn, including the turns that were only conversation — which
 * the prompt itself says is most of them. That put every "hi" through a strict
 * `response_format`, narrowed the provider pool to those honouring it, and hid
 * the reply inside a JSON string so nothing could render until the document
 * had started.
 *
 * Here the conversation is a conversation, streaming plain text on exactly the
 * transport reading chat uses, and the structure appears only when there is
 * structure to carry: a proposal, an adjustment, a log. Samwell's focus is the
 * only difference between the two surfaces, which is what it always should
 * have been.
 *
 * Everything below executes on the device, because that is where Compass data
 * lives. The server only defines the shapes.
 */

/**
 * The house convention for a tool the model reads from: the caller gets the
 * structured value it needs, and `formatted` is the prose the model actually
 * reads. Numbers are pre-computed here rather than left to the model, since
 * a consistency ratio it works out itself is a number about someone's
 * discipline that nobody checked.
 */
const ReadOutputSchema = z.object({
  formatted: z.string(),
});

const WriteOutputSchema = z.object({
  ok: z.boolean(),
  formatted: z.string(),
});

// ── Reading the Compass data ────────────────────────────────────────────────

export const GetCompassStatusInputSchema = z.object({});

export const getCompassStatusTool = toolDefinition({
  name: 'get_compass_status',
  description:
    "Every active goal and how each is actually going: one summary line per goal with the PRIMARY one marked, full trackable detail (schedules, consistency on each, execution, outcome) for the primary goal and the one the user is viewing, and a LEAN line when a side goal is running ahead of the primary. These are the same numbers the Insights and overview screens show. Call this before discussing progress, before proposing an adjustment, and whenever the user asks what their data means. Trackable ids from any active goal work in the other tools. Returns no goal if they have not set one up yet.",
  inputSchema: GetCompassStatusInputSchema,
  outputSchema: ReadOutputSchema,
});

export const GetTodayInputSchema = z.object({});

export const getTodayTool = toolDefinition({
  name: 'get_today',
  description:
    "What is scheduled for the user today and which of it has already been logged, in the order it is meant to happen. Call this when the conversation turns to today, before asking how their day has gone, and before logging anything, so you ask about what is actually due rather than guessing. Also tells you what is still open, which is what you would offer to log for them.",
  inputSchema: GetTodayInputSchema,
  outputSchema: ReadOutputSchema,
});

export const GetTrackableHistoryInputSchema = z.object({
  trackable_id: z.string().min(1),
  /** How far back to look. Defaults to the last four weeks. */
  days: z.number().int().min(1).max(365).nullable(),
});

export const getTrackableHistoryTool = toolDefinition({
  name: 'get_trackable_history',
  description:
    "The log history of one trackable: which days were done, which were missed, which were paused, and every note the user wrote on them. Use this when a number needs explaining rather than restating: the notes are where the reason for a bad week usually is, and quoting the user's own words back to them is worth more than the ratio.",
  inputSchema: GetTrackableHistoryInputSchema,
  outputSchema: ReadOutputSchema,
});

// ── Logging on the user's behalf ────────────────────────────────────────────

export const LOG_OUTCOMES = ['DONE', 'MISSED'] as const;

export const LogTrackableInputSchema = z.object({
  trackable_id: z.string().min(1),
  outcome: z.enum(LOG_OUTCOMES),
  /**
   * The number, for a trackable measured by one. Null for a COMPLETION
   * trackable, and null on a miss, where a number would contradict the
   * outcome.
   */
  value: z.number().nullable(),
  /**
   * What they said about it, in their words rather than yours. A note on a
   * win is worth as much as one on a miss.
   */
  note: z.string().max(600).nullable(),
  /** `YYYY-MM-DD`. Null means today. Never log a day that has not happened. */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
    .nullable(),
});

export const logTrackableTool = toolDefinition({
  name: 'log_trackable',
  description:
    "Record that the user did or did not do a scheduled trackable, with an optional note. Only ever call this after they have told you what happened. You are writing down their answer, not deciding it. An explained miss counts exactly like a silent one, so log a miss as a miss and put the reason in the note. The user confirms every log before it is written.",
  inputSchema: LogTrackableInputSchema,
  outputSchema: WriteOutputSchema,
  /*
   * The consistency ratio is a number the app shows someone about their own
   * discipline. A turn where Samwell reads "not yet" as "yes" would put a lie
   * in it that no later conversation corrects, so one tap showing exactly what
   * is about to be written is cheap next to that.
   */
  needsApproval: true,
});

// ── The goal's life ─────────────────────────────────────────────────────────

export const GoalIdInputSchema = z.object({
  goal_id: z
    .string()
    .describe('The goal to act on. Call get_compass_status first so the id is real.'),
});

export const StopGoalInputSchema = GoalIdInputSchema.extend({
  reason: z
    .string()
    .min(1)
    .max(1000)
    .describe(
      "Why they are stopping, in their own words. Ask them; do not write it for them. This is the one sentence the archive cannot reconstruct.",
    ),
});

export const TrackableIdInputSchema = z.object({
  trackable_id: z
    .string()
    .describe('The trackable to act on. Call get_compass_status first so the id is real.'),
});

export const finishGoalTool = toolDefinition({
  name: 'finish_goal',
  description:
    "Close a goal out as finished. Only when its end date has passed or it has reached its number. Otherwise the app refuses, and rightly: finishing early on a whim is the procrastination this is built against, pointed the other way. The user confirms before it is written.",
  inputSchema: GoalIdInputSchema,
  outputSchema: WriteOutputSchema,
  needsApproval: true,
});

export const stopGoalTool = toolDefinition({
  name: 'stop_goal',
  description:
    "Retire a goal before its end. Never suggest this yourself when a week has gone badly: a bad week is what the goal is for. Call it when the user has decided, and put their reason in the note. The user confirms before it is written.",
  inputSchema: StopGoalInputSchema,
  outputSchema: WriteOutputSchema,
  needsApproval: true,
});

export const setPrimaryGoalTool = toolDefinition({
  name: 'set_primary_goal',
  description:
    'Move the main-goal mark to a different goal. The main goal is the one you steer back toward and the one the overview leads with. The user confirms before it is written.',
  inputSchema: GoalIdInputSchema,
  outputSchema: WriteOutputSchema,
  needsApproval: true,
});

export const pauseTrackableTool = toolDefinition({
  name: 'pause_trackable',
  description:
    "Pause one activity, so the days it is paused stop counting against consistency. This is the honest tool for a real interruption (illness, travel, a broken week), and it is why a paused day is not a missed day. The user confirms before it is written.",
  inputSchema: TrackableIdInputSchema,
  outputSchema: WriteOutputSchema,
  needsApproval: true,
});

export const resumeTrackableTool = toolDefinition({
  name: 'resume_trackable',
  description:
    'Bring a paused activity back. It starts counting again from today, not retroactively. The user confirms before it is written.',
  inputSchema: TrackableIdInputSchema,
  outputSchema: WriteOutputSchema,
  needsApproval: true,
});

// ── Proposing ───────────────────────────────────────────────────────────────

export const proposeGoalTool = toolDefinition({
  name: 'propose_goal',
  description:
    "Put a complete goal proposal on screen for the user to approve, revise, or reject. Call this only once the conversation has produced something concrete you would stand behind. While you are still clarifying, just keep talking. Keep the message you write alongside it short, since the card carries the detail. Nothing is created until the user approves it, and they can ask you to change it, so propose rather than hedge.",
  inputSchema: GoalProposalModelSchema,
  outputSchema: WriteOutputSchema,
});

export const proposeAdjustmentsTool = toolDefinition({
  name: 'propose_adjustments',
  description:
    "Put changes to an existing goal's trackables on screen for the user to approve: pause one, resume one, change a target, or retire one. Optionally attach a short note to their journey record. Use this when the data and the conversation agree that the system needs changing, not every time a week goes badly. Call get_compass_status first so the trackable ids are real and the change is argued from what actually happened.",
  inputSchema: CompassCheckinDraftModelSchema,
  outputSchema: WriteOutputSchema,
});

// ── The set ─────────────────────────────────────────────────────────────────

export const COMPASS_TOOL_DEFINITIONS = [
  getCompassStatusTool,
  getTodayTool,
  getTrackableHistoryTool,
  logTrackableTool,
  finishGoalTool,
  stopGoalTool,
  setPrimaryGoalTool,
  pauseTrackableTool,
  resumeTrackableTool,
  proposeGoalTool,
  proposeAdjustmentsTool,
  /*
   * The library, shared with reading chat rather than redefined.
   *
   * Compass used to be handed a pre-selected `readingContext` blob chosen by a
   * keyword match before the conversation started, which meant the passages
   * were picked before anyone knew what the turn was about. Samwell searches
   * for himself now, and the passages he finds are the ones that fit what is
   * actually being discussed. This is the part that makes Compass Open
   * Citadel's rather than any goal tracker's, so it is not optional.
   */
  searchHighlightsTool,
  searchThoughtsTool,
  searchReadingTool,
  /*
   * One journey, not two. A reflection written down after a Compass
   * conversation should be findable from a book chat and the other way round,
   * which is only true if both surfaces reach the same notes through the same
   * tool.
   */
  searchJourneyTool,
] as const;

export const COMPASS_CLIENT_TOOL_DEFINITIONS = COMPASS_TOOL_DEFINITIONS.map((tool) =>
  tool.client(),
);

/**
 * Tools that write, and so must be confirmed by the user before they run.
 *
 * `log_trackable` is here for a reason worth stating: the consistency ratio is
 * a number the app shows someone about their own discipline, and a turn where
 * Samwell misreads "not yet" as "yes" would put a lie in it that no later
 * conversation corrects. One tap that shows exactly what is about to be
 * written is cheap next to that.
 *
 * The two `propose_*` tools are absent on purpose: they write nothing. They
 * render a card, and the card has its own approve button.
 */
export const COMPASS_APPROVAL_REQUIRED_TOOLS: ReadonlySet<string> = new Set([
  'log_trackable',
  // Every one of these ends or reshapes something the user has been running
  // for weeks, and none of them is undoable from a conversation.
  'finish_goal',
  'stop_goal',
  'set_primary_goal',
  'pause_trackable',
  'resume_trackable',
]);

export const COMPASS_TOOL_NAMES: ReadonlySet<string> = new Set(
  COMPASS_TOOL_DEFINITIONS.map((tool) => tool.name),
);
