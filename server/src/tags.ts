import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  DEFAULT_CLOUD_MODEL_ID,
  normalizeTags,
  SUGGEST_TAGS_PROMPT,
  SuggestTagsRequestSchema,
  SuggestTagsResponseSchema,
} from 'samwell-shared';

import { runStructuredAnalysis } from './compass.js';
import { listCloudModels, reserveUsageEvent } from './db.js';
import { readDeviceId, requireOpenRouterKey } from './http-helpers.js';

function resolveModelId(requested: string | undefined, knownModelIds: string[]): string {
  const modelId = requested ?? DEFAULT_CLOUD_MODEL_ID;
  return knownModelIds.includes(modelId) ? modelId : (knownModelIds[0] ?? DEFAULT_CLOUD_MODEL_ID);
}

export const tagsRoutes = new Hono();

tagsRoutes.post('/suggest', async (c) => {
  requireOpenRouterKey();
  const deviceId = readDeviceId(c);

  const parsed = SuggestTagsRequestSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }

  const knownModels = await listCloudModels();
  const modelId = resolveModelId(
    parsed.data.modelId,
    knownModels.map((model) => model.id),
  );
  const usageEventId = `tags-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const reservation = await reserveUsageEvent({
    id: usageEventId,
    deviceId,
    modelId,
    countsTowardLimit: true,
    kind: 'tag_suggest',
  });
  if (!reservation.allowed) {
    return c.json(
      {
        error: 'usage_limit_reached',
        reason: reservation.reason,
        usage: reservation.usage,
      },
      429,
    );
  }

  const { modelId: _requestedModel, ...payload } = parsed.data;
  // No tight token cap here: reasoning-capable models spend completion tokens on
  // reasoning before they emit the JSON, so a small budget gets exhausted first and
  // the structured output never validates. The reply is a handful of tokens anyway.
  const result = await runStructuredAnalysis({
    modelId,
    systemPrompts: [SUGGEST_TAGS_PROMPT],
    messages: [{ role: 'user', content: JSON.stringify(payload) }],
    schema: SuggestTagsResponseSchema,
    usageEventId,
  });

  const tags = normalizeTags(result.tags);
  if (tags.length === 0) {
    throw new HTTPException(502, { message: 'tag_suggest_failed' });
  }
  return c.json({ tags });
});
