import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  DEFAULT_CLOUD_MODEL_ID,
  SUGGEST_CHAT_TITLE_PROMPT,
  SuggestChatTitleRequestSchema,
  SuggestChatTitleResponseSchema,
} from 'samwell-shared';

import { runStructuredAnalysis } from './compass.js';
import { listCloudModels, reserveUsageEvent } from './db.js';
import { readDeviceId, requireOpenRouterKey } from './http-helpers.js';

function resolveModelId(requested: string | undefined, knownModelIds: string[]): string {
  const modelId = requested ?? DEFAULT_CLOUD_MODEL_ID;
  return knownModelIds.includes(modelId) ? modelId : (knownModelIds[0] ?? DEFAULT_CLOUD_MODEL_ID);
}

export const chatTitleRoutes = new Hono();

chatTitleRoutes.post('/title', async (c) => {
  requireOpenRouterKey();
  const deviceId = readDeviceId(c);

  const parsed = SuggestChatTitleRequestSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }

  const knownModels = await listCloudModels();
  const modelId = resolveModelId(
    parsed.data.modelId,
    knownModels.map((model) => model.id),
  );
  const usageEventId = `chat-title-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const reservation = await reserveUsageEvent({
    id: usageEventId,
    deviceId,
    modelId,
    countsTowardLimit: true,
    kind: 'chat_title',
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
  const result = await runStructuredAnalysis({
    modelId,
    systemPrompts: [SUGGEST_CHAT_TITLE_PROMPT],
    messages: [{ role: 'user', content: JSON.stringify(payload) }],
    schema: SuggestChatTitleResponseSchema,
    usageEventId,
  });

  return c.json(result);
});
