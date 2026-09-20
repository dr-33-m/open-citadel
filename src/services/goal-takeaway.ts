import {
  GoalTakeawayResponseSchema,
  normalizeTakeaway,
  type GoalTakeawayRequest,
} from 'samwell-shared';

import { cloudJsonHeaders } from '@/services/cloud-identity';
import { formatOutcomeSummary } from '@/services/journey';
import { scheduleSummary } from '@/services/occurrences';
import { readGoals, useCompassStore } from '@/stores/compass';
import { useSettingsStore } from '@/stores/settings';
import { categoryLabel } from '@/utils/goal-category';

/**
 * Samwell's reading of a goal that just ended.
 *
 * Cloud only, and deliberately so. Compass is a cloud feature end to end — the
 * planner, the check-ins and the goal proposals all are — and a takeaway is
 * the one piece of writing in the app that has to weigh a whole run against
 * what someone said about why they stopped. The 4096-token local context is
 * not where that gets done well, and a shallow one would be worse than the
 * card saying he has not written one.
 *
 * Throws on failure rather than returning null: the caller decides whether a
 * missing takeaway is worth telling the reader about, and for a goal that has
 * already been archived successfully, it is not.
 */
export async function requestGoalTakeaway(
  payload: Omit<GoalTakeawayRequest, 'modelId'>,
): Promise<string> {
  const { cloudBaseUrl, cloudModelId } = useSettingsStore.getState();
  if (!cloudBaseUrl) {
    throw new Error('Grand Maester Samwell is not set up in this build.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  let res: Response;
  try {
    res = await fetch(`${cloudBaseUrl}/compass/takeaway`, {
      method: 'POST',
      headers: await cloudJsonHeaders(),
      body: JSON.stringify({ ...payload, modelId: cloudModelId }),
      signal: controller.signal,
    });
  } catch {
    throw new Error('Cannot reach Grand Maester Samwell. Check your connection.');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.warn('[Samwell Cloud] goal takeaway failed', res.status, detail.slice(0, 300));
    throw new Error(`Couldn't write a takeaway (${res.status}).`);
  }

  const parsed = GoalTakeawayResponseSchema.safeParse(await res.json());
  if (!parsed.success) throw new Error("Couldn't write a takeaway.");
  return normalizeTakeaway(parsed.data.takeaway);
}

/**
 * Ask Samwell what he made of a goal that has just ended, and keep the answer.
 *
 * One path for every way a goal ends. It lived in the Compass screen's hook,
 * so a goal closed from the screen got a takeaway and one Samwell closed in
 * conversation (`finish_goal` / `stop_goal`) never did: no line on its page,
 * and nothing about how it went in his memory.
 *
 * Read out of the store rather than passed in: this runs after the archive
 * has already reloaded, so a caller's copy of the goal may be a render
 * behind. `goals` keeps archived goals, and `goal_outcomes` holds the frozen
 * figures, so everything the prompt needs survives the archiving.
 *
 * Throws like `requestGoalTakeaway`; the caller decides what a miss is worth.
 */
export async function writeGoalTakeaway(goalId: string): Promise<void> {
  const state = useCompassStore.getState();
  const goal = state.goals.find((g) => g.id === goalId);
  const entry = state.pastGoals.find((p) => p.goal.id === goalId);
  if (!goal || !entry) return;

  const { outcome } = entry;
  // Read from the database, not from `dataByGoal`: that map only holds ACTIVE
  // goals, and this one was archived a moment ago.
  const data = readGoals([goalId]).get(goalId);
  const activities = (data?.views ?? [])
    .map((t) => `- ${t.title} (${scheduleSummary(t.schedule)})`)
    .join('\n');

  const takeaway = await requestGoalTakeaway({
    title: goal.title,
    category: categoryLabel(goal.category),
    completed: outcome.completed === 1,
    startDate: goal.startDate,
    endedOn: outcome.endedOn,
    consistencyPct:
      outcome.executionRatio == null ? null : Math.round(outcome.executionRatio * 100),
    outcomeSummary: formatOutcomeSummary(
      outcome.outcomeValue,
      outcome.outcomeTarget,
      outcome.outcomeUnit,
    ),
    reason: outcome.reason,
    activities: activities.slice(0, 2000),
  });
  await useCompassStore.getState().saveTakeaway(goalId, takeaway);
}
