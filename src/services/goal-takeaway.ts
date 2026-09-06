import {
  GoalTakeawayResponseSchema,
  normalizeTakeaway,
  type GoalTakeawayRequest,
} from 'samwell-shared';

import { useSettingsStore } from '@/stores/settings';

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
  const { cloudBaseUrl, cloudModelId, getCloudDeviceId } = useSettingsStore.getState();
  if (!cloudBaseUrl) {
    throw new Error('Grand Maester Samwell is not set up in this build.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  let res: Response;
  try {
    res = await fetch(`${cloudBaseUrl}/compass/takeaway`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-samwell-device-id': await getCloudDeviceId(),
      },
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
