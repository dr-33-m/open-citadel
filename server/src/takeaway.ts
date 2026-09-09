import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  GOAL_TAKEAWAY_PROMPT,
  GoalTakeawayModelSchema,
  GoalTakeawayRequestSchema,
  GoalTakeawayResponseSchema,
  normalizeTakeaway,
  SAMWELL_CHARACTER,
} from 'samwell-shared';

import { runStructuredAnalysis } from './structured-analysis.js';
import { listCloudModels, recordUsageEvent, resolveModelId } from './db.js';
import { requireOpenRouterKey } from './http-helpers.js';
import { readIdentity } from './identity.js';

export const takeawayRoutes = new Hono();

/**
 * What Samwell made of a goal that just ended.
 *
 * One call per goal, at the moment it is closed out, and the answer is stored
 * on the device. Not re-asked when the archive is opened: the point of a
 * takeaway is that it is what he thought at the time, and one that quietly
 * reworded itself every time the sheet was opened would be worth nothing.
 *
 * The persona is included because this is Samwell speaking, not a summarizer.
 * A goal ending is one of the few moments where the counterweight voice
 * matters most — somebody stopping a goal early does not need to be told it is
 * fine, and does not need to be told off either.
 */
takeawayRoutes.post('/takeaway', async (c) => {
  requireOpenRouterKey();
  const { id: accountId } = await readIdentity(c);

  const parsed = GoalTakeawayRequestSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }

  const knownModels = await listCloudModels();
  const modelId = resolveModelId(
    parsed.data.modelId,
    knownModels.map((model) => model.id),
  );
  const usageEventId = `takeaway-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await recordUsageEvent({
    id: usageEventId,
    accountId,
    modelId,
    countsTowardLimit: true,
    kind: 'goal_takeaway',
  });

  const { modelId: _requestedModel, ...payload } = parsed.data;
  const result = await runStructuredAnalysis({
    modelId,
    systemPrompts: [SAMWELL_CHARACTER, GOAL_TAKEAWAY_PROMPT],
    messages: [{ role: 'user', content: JSON.stringify(payload) }],
    schema: GoalTakeawayModelSchema,
    usageEventId,
    failureCode: 'goal_takeaway_failed',
  });

  // Validated loosely, then trimmed to fit — see GoalTakeawayModelSchema.
  const takeaway = normalizeTakeaway(result.takeaway);
  if (!takeaway) {
    throw new HTTPException(502, { message: 'goal_takeaway_failed' });
  }

  return c.json(GoalTakeawayResponseSchema.parse({ takeaway }));
});
