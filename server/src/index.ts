import 'dotenv/config';

import { serve } from '@hono/node-server';
import { chat, toHttpResponse, type StreamChunk } from '@tanstack/ai';
import { openRouterText } from '@tanstack/ai-openrouter';
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { logger } from 'hono/logger';
import {
  DEFAULT_CLOUD_MODEL_ID,
  SAMWELL_CLIENT_TOOL_DEFINITIONS,
  SAMWELL_SYSTEM_PROMPT,
  type CloudModelCapability,
  type CloudModelOption,
} from 'samwell-shared';
import { z } from 'zod';

import {
  checkUsageLimit,
  createUsageEvent,
  getUsageState,
  initDb,
  listCloudModels,
  updateUsageEvent,
  upsertCloudModel,
} from './db.js';

type RunAgentInput = {
  threadId?: string;
  runId?: string;
  messages?: Array<unknown>;
  forwardedProps?: Record<string, unknown>;
  data?: Record<string, unknown>;
};

function requireOpenRouterKey(): void {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new HTTPException(500, {
      message: 'OPENROUTER_API_KEY is not configured on the server.',
    });
  }
}

function requireAdminKey(c: Context): void {
  if (!process.env.ADMIN_API_KEY) {
    throw new HTTPException(500, {
      message: 'ADMIN_API_KEY is not configured on the server.',
    });
  }
  const provided = c.req.header('x-admin-key');
  if (!provided || provided !== process.env.ADMIN_API_KEY) {
    throw new HTTPException(401, { message: 'Invalid or missing x-admin-key header.' });
  }
}

const AdminModelSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  provider: z.string().min(1),
  description: z.string().min(1),
  capabilities: z.array(z.enum(['text', 'vision', 'audio', 'tools'])).min(1),
});

function readDeviceId(c: Context): string {
  const headerDeviceId = c.req.header('x-samwell-device-id')?.trim();
  if (headerDeviceId) return headerDeviceId;

  throw new HTTPException(401, {
    message: 'Missing x-samwell-device-id header.',
  });
}

function readModelId(body: RunAgentInput, knownModelIds: string[]): string {
  const raw =
    body.forwardedProps?.modelId ??
    body.data?.modelId ??
    DEFAULT_CLOUD_MODEL_ID;
  const modelId = typeof raw === 'string' ? raw : DEFAULT_CLOUD_MODEL_ID;
  return knownModelIds.includes(modelId) ? modelId : (knownModelIds[0] ?? DEFAULT_CLOUD_MODEL_ID);
}

function isCountableUserTurn(messages: Array<unknown>): boolean {
  const last = messages.at(-1);
  if (!last || typeof last !== 'object') return true;
  return (last as { role?: unknown }).role === 'user';
}

function extractUsage(chunk: StreamChunk): {
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  costUsd?: number | null;
} {
  if (chunk.type !== 'RUN_FINISHED') return {};
  const usage = chunk.usage as
    | {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
        cost?: number;
      }
    | undefined;

  return {
    promptTokens: usage?.promptTokens ?? null,
    completionTokens: usage?.completionTokens ?? null,
    totalTokens: usage?.totalTokens ?? null,
    costUsd: usage?.cost ?? null,
  };
}

async function* meterStream(
  stream: AsyncIterable<StreamChunk>,
  usageEventId: string,
  threadId: string | undefined,
  modelId: string,
): AsyncIterable<StreamChunk> {
  let settled = false;

  try {
    for await (const chunk of stream) {
      if (chunk.type === 'RUN_FINISHED') {
        settled = true;
        await updateUsageEvent(usageEventId, {
          status: 'completed',
          ...extractUsage(chunk),
        });
      } else if (chunk.type === 'RUN_ERROR') {
        settled = true;
        await updateUsageEvent(usageEventId, {
          status: 'errored',
          error: chunk.message ?? 'Run error',
        });
      }

      yield chunk;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown stream error';
    console.error('[Samwell Cloud] Stream failed:', error);
    settled = true;
    await updateUsageEvent(usageEventId, {
      status: 'errored',
      error: message,
    });
    yield {
      type: 'RUN_ERROR',
      threadId: threadId ?? '',
      runId: usageEventId,
      model: modelId,
      timestamp: Date.now(),
      message,
    } as StreamChunk;
  } finally {
    if (!settled) {
      await updateUsageEvent(usageEventId, {
        status: 'errored',
        error: 'Stream closed before a terminal event.',
      });
    }
  }
}

await initDb();

const app = new Hono();

app.use('*', logger());

app.use(
  '*',
  cors({
    origin: process.env.SAMWELL_ALLOWED_ORIGIN ?? '*',
    allowHeaders: ['Content-Type', 'x-samwell-device-id'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
  }),
);

app.get('/health', async (c) => {
  const models = await listCloudModels();
  return c.json({
    ok: true,
    service: 'samwell-cloud',
    chatReady: Boolean(process.env.OPENROUTER_API_KEY),
    models: models.map((model) => model.id),
  });
});

app.get('/models', async (c) => {
  const models = await listCloudModels();
  return c.json({
    models,
    defaultModelId: models[0]?.id ?? DEFAULT_CLOUD_MODEL_ID,
  });
});

app.post('/admin/models', async (c) => {
  requireAdminKey(c);

  const body = await c.req.json();
  const parsed = AdminModelSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }

  const model: CloudModelOption = {
    ...parsed.data,
    capabilities: parsed.data.capabilities as CloudModelCapability[],
  };
  await upsertCloudModel(model);

  const models = await listCloudModels();
  return c.json({
    models,
    defaultModelId: models[0]?.id ?? DEFAULT_CLOUD_MODEL_ID,
  });
});

app.get('/usage', async (c) => {
  const deviceId = readDeviceId(c);
  return c.json(await getUsageState(deviceId));
});

app.post('/chat/http', async (c) => {
  requireOpenRouterKey();

  const deviceId = readDeviceId(c);
  const body = (await c.req.json()) as RunAgentInput;
  if (!Array.isArray(body.messages)) {
    throw new HTTPException(400, { message: 'messages must be an array.' });
  }

  const countsTowardLimit = isCountableUserTurn(body.messages);
  if (countsTowardLimit) {
    const limit = await checkUsageLimit(deviceId);
    if (!limit.allowed) {
      return c.json(
        {
          error: 'usage_limit_reached',
          reason: limit.reason,
          usage: limit.usage,
        },
        429,
      );
    }
  }

  const knownModels = await listCloudModels();
  const knownModelIds = knownModels.map((model) => model.id);
  const modelId = readModelId(body, knownModelIds);
  const usageEventId =
    body.runId ?? `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await createUsageEvent({
    id: usageEventId,
    deviceId,
    modelId,
    countsTowardLimit,
  });

  const stream = chat({
    adapter: openRouterText(modelId as any, {
      httpReferer: process.env.OPENROUTER_HTTP_REFERER,
      appTitle: process.env.OPENROUTER_APP_TITLE ?? 'Open Citadel',
    }),
    messages: body.messages as any,
    systemPrompts: [SAMWELL_SYSTEM_PROMPT],
    tools: SAMWELL_CLIENT_TOOL_DEFINITIONS,
    threadId: body.threadId,
    runId: body.runId ?? usageEventId,
    modelOptions: {
      models: knownModelIds.filter((id) => id !== modelId) as any,
      temperature: 0.7,
      maxCompletionTokens: 1200,
      toolChoice: 'auto',
      parallelToolCalls: false,
    },
  });

  return toHttpResponse(meterStream(stream, usageEventId, body.threadId, modelId), {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
});

app.onError((err, c) => {
  console.error('[Samwell Cloud] Request failed:', err);
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  return c.json({ error: 'internal_server_error' }, 500);
});

const port = Number(process.env.PORT ?? 8787);
serve(
  {
    fetch: app.fetch,
    hostname: '0.0.0.0',
    port,
  },
  () => {
    console.log(`Samwell Cloud server listening on http://0.0.0.0:${port}`);
  },
);
