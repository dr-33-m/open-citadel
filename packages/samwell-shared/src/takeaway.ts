import { z } from 'zod';

/**
 * What Samwell makes of a goal that has ended.
 *
 * Written once, at the moment the goal is closed out, and kept. It is the
 * reconciliation the whole archive exists for: the numbers say what happened,
 * and this says what it means for the next goal.
 */

/** The longest takeaway the summary card will draw before it stops being read. */
const MAX_TAKEAWAY = 320;

export const GoalTakeawayRequestSchema = z.object({
  title: z.string().min(1).max(200),
  category: z.string().min(1).max(60),
  /** Whether they finished it or stopped it early. Changes everything about
   *  what there is to say. */
  completed: z.boolean(),
  startDate: z.string().min(1).max(10),
  endedOn: z.string().min(1).max(10),
  /** 0..100 as it stood on the day it ended, or null when nothing was due. */
  consistencyPct: z.number().min(0).max(100).nullable(),
  /** The numeric outcome, already worded: "1200 of 4000 USD". */
  outcomeSummary: z.string().max(120).nullable(),
  /** Their own words for why they stopped. Null on a finished goal. */
  reason: z.string().max(1000).nullable(),
  /** The trackables the goal ran on, one per line, so the takeaway can name
   *  the actual habit rather than the goal in the abstract. */
  activities: z.string().max(2000),
  modelId: z.string().optional(),
});
export type GoalTakeawayRequest = z.infer<typeof GoalTakeawayRequestSchema>;

/** The contract the client relies on, capped at what the card can show. */
export const GoalTakeawayResponseSchema = z.object({
  takeaway: z.string().min(1).max(MAX_TAKEAWAY),
});
export type GoalTakeawayResponse = z.infer<typeof GoalTakeawayResponseSchema>;

/**
 * What the MODEL is held to, deliberately looser than the response above.
 *
 * The same lesson as `SuggestChatTitleModelSchema`: holding a model to an
 * exact character budget throws away good output over one word, retries, and
 * 502s with a perfectly usable answer in hand. The server trims instead.
 */
export const GoalTakeawayModelSchema = z.object({
  takeaway: z.string().min(1).max(900),
});

export const GOAL_TAKEAWAY_PROMPT =
  `Task: you are Samwell. A goal the user was tracking has just ended, and you are writing the note you keep about it. The user message is JSON describing the goal, how it ended, and the activities it ran on.

Write 2 to 3 sentences, under 300 characters, addressed to the user as "you".

- Say what actually happened, using the numbers you were given. Do not invent any number that is not in the JSON.
- Then say the one thing this run tells you about how they work, that would change how you would set up the next goal like it. Be specific to this goal, not to goals in general.
- If they stopped early and gave a reason, take the reason seriously and at face value. Stopping a goal that was wrong for them is a good decision, not a failure, and low consistency on a goal they abandoned early is information about the plan, not about them.
- If they finished it, say so plainly. Do not gush, do not congratulate more than once, and do not promise what you will do in future.
- Plain, simple English. No em dashes. No bullet points. No headings. No surrounding quotes.`;

/** Trims the wrapping a model sometimes adds, and enforces the length cap. */
export function normalizeTakeaway(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length <= MAX_TAKEAWAY) return cleaned;

  // Cut at the last sentence that fits rather than mid-word: a takeaway that
  // stops in the middle of a thought reads as a bug, and losing the last
  // sentence loses less than that.
  const clipped = cleaned.slice(0, MAX_TAKEAWAY);
  const lastStop = Math.max(clipped.lastIndexOf('. '), clipped.lastIndexOf('! '));
  return lastStop > 80 ? clipped.slice(0, lastStop + 1) : clipped.trim();
}
