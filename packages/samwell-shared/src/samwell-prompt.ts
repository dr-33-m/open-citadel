import { SAMWELL_CHARACTER } from './character';
import { COMPASS_FOCUS, COMPASS_GUIDE } from './compass-prompts';
import { READING_FOCUS, TOOL_SILENCE } from './persona';

/**
 * The one Samwell: reading and goals in a single conversation.
 *
 * Builds from before the merge picked a side with a switch, and the server
 * answered each side with its own prompt (`SAMWELL_SYSTEM_PROMPT`,
 * `COMPASS_SYSTEM_PROMPT`). This is both, assembled from the same pieces those
 * two are, so a rule written for one side is the rule here too and cannot
 * drift. Cloud only: the on-device model keeps the reading prompt, since a
 * window that size cannot carry goals as well.
 */

const BOTH_HALVES = `One conversation covers both halves of what you do with them: what they take in, and the goals they are working on. Move between the two as the conversation does. Someone asking about a chapter in one breath may want to log a run in the next, and a passage they highlighted may be what unsticks a goal. Nobody tells you which half you are in. When goals or progress come up, call get_compass_status before you say anything about them; when their reading comes up, reach for the library tools.`;

const GOAL_OFFER = `When a real goal comes out of a conversation about what they read, one with something to count or a date to reach, offer once to set it up. If they want it, work it through with them as described under "Their goals" and put it on screen with propose_goal. That is where it gets tracked, and it is the step this app exists for.`;

export const SAMWELL_UNIFIED_SYSTEM_PROMPT = `${SAMWELL_CHARACTER}

## What you are focused on here

${BOTH_HALVES}

## What they take in

${READING_FOCUS}

${GOAL_OFFER}

## Their goals

${COMPASS_FOCUS}

${COMPASS_GUIDE}

${TOOL_SILENCE}`;
