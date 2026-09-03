import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  normalizeChatTitle,
  SUGGEST_CHAT_TITLE_PROMPT,
  SuggestChatTitleModelSchema,
  SuggestChatTitleRequestSchema,
  SuggestChatTitleResponseSchema,
} from 'samwell-shared';

import { runStructuredAnalysis } from './structured-analysis.js';
import { listCloudModels, reserveUsageEvent, resolveModelId } from './db.js';
import { readDeviceId, requireOpenRouterKey } from './http-helpers.js';

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
  // Validated loosely, then trimmed to fit — see SuggestChatTitleModelSchema.
  const result = await runStructuredAnalysis({
    modelId,
    systemPrompts: [SUGGEST_CHAT_TITLE_PROMPT],
    messages: [{ role: 'user', content: JSON.stringify(payload) }],
    schema: SuggestChatTitleModelSchema,
    usageEventId,
    failureCode: 'chat_title_failed',
  });

  const title = normalizeChatTitle(result.title);
  // Normalizing can empty a title that was nothing but quotes or punctuation.
  // That's a failed generation, not a title worth showing.
  if (!title) {
    throw new HTTPException(502, { message: 'chat_title_failed' });
  }

  return c.json(SuggestChatTitleResponseSchema.parse({ title }));
});
