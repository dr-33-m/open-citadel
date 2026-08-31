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
  resolveContextTokens,
  type CloudModelCapability,
  type CloudModelOption,
} from 'samwell-shared';
import { z } from 'zod';

import { chatTitleRoutes } from './chat-title.js';
import {
  clearToolResults,
  composeStrategies,
  evictOldest,
  summarizeOldest,
  withCompaction,
} from './compaction.js';
import { compassRoutes, runStructuredAnalysis } from './compass.js';
import { startModelContextRefresh } from './model-context.js';
import { tagsRoutes } from './tags.js';
import {
  getUsageState,
  initDb,
  listCloudModels,
  reserveUsageEvent,
  updateUsageEvent,
  upsertCloudModel,
} from './db.js';
import { readDeviceId, requireOpenRouterKey } from './http-helpers.js';

type RunAgentInput = {
  threadId?: string;
  runId?: string;
  messages?: Array<unknown>;
  forwardedProps?: Record<string, unknown>;
  data?: Record<string, unknown>;
};

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
  /**
   * Optional override. Normally left out: the background refresh reads the
   * real window from OpenRouter, and `null` means "not known yet", which
   * `resolveContextTokens` reads as the conservative floor. Set it by hand
   * only for a model OpenRouter does not list.
   */
  contextTokens: z.number().int().positive().nullable().optional(),
});

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

// Background, and deliberately not awaited: the first refresh must not hold
// up the server accepting requests, and every model already has a usable
// floor to fall back on until it lands.
startModelContextRefresh();

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
    contextTokens: parsed.data.contextTokens ?? null,
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

app.route('/compass', compassRoutes);
app.route('/tags', tagsRoutes);
app.route('/chat', chatTitleRoutes);

app.post('/chat/http', async (c) => {
  requireOpenRouterKey();

  const deviceId = readDeviceId(c);
  const body = (await c.req.json()) as RunAgentInput;
  if (!Array.isArray(body.messages)) {
    throw new HTTPException(400, { message: 'messages must be an array.' });
  }

  const countsTowardLimit = isCountableUserTurn(body.messages);

  const rawMessages = body.messages as Array<{ role?: string; content?: unknown }>;
  const sessionSystemPrompts = rawMessages
    .filter((m) => m?.role === 'system' && typeof m.content === 'string' && m.content.trim())
    .map((m) => m.content as string);
  const conversationMessages = rawMessages.filter((m) => m?.role !== 'system');

  const knownModels = await listCloudModels();
  const knownModelIds = knownModels.map((model) => model.id);
  const modelId = readModelId(body, knownModelIds);
  const usageEventId =
    body.runId ?? `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const reservation = await reserveUsageEvent({
    id: usageEventId,
    deviceId,
    modelId,
    countsTowardLimit,
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

  /*
   * Fallbacks OpenRouter may reroute to if the primary is unavailable.
   *
   * Filtered by capability rather than passing every other known model: this
   * request carries tool definitions, so a model that cannot call tools is not
   * a substitute for one that can — it is a destination where the request
   * arrives broken. Every model in the catalogue happens to support tools
   * today, which is exactly why this is worth pinning down now: `/admin/models`
   * can add one that does not, and nothing else would catch it.
   */
  const fallbackModels = knownModels.filter(
    (model) => model.id !== modelId && model.capabilities.includes('tools'),
  );

  /*
   * Compact against the smallest window the request could actually land on,
   * not the primary's.
   *
   * A fallback is a different model with a different window. Sizing the
   * request for the primary alone means a conversation trimmed to fit
   * Gemini's million tokens can be rerouted to a 128k model and overflow
   * there — the exact failure compaction exists to prevent, arriving by the
   * one path that looks like it was handled.
   */
  const contextTokens = Math.min(
    ...[
      knownModels.find((model) => model.id === modelId) ?? { contextTokens: null },
      ...fallbackModels,
    ].map(resolveContextTokens),
  );
  const compactionBudget = Math.floor(contextTokens * CONTEXT_BUDGET_RATIO);

  const stream = chat({
    adapter: openRouterText(modelId as any, {
      httpReferer: process.env.OPENROUTER_HTTP_REFERER,
      appTitle: process.env.OPENROUTER_APP_TITLE ?? 'Open Citadel',
    }),
    messages: conversationMessages as any,
    systemPrompts: [SAMWELL_SYSTEM_PROMPT, ...sessionSystemPrompts],
    tools: SAMWELL_CLIENT_TOOL_DEFINITIONS,
    threadId: body.threadId,
    runId: body.runId ?? usageEventId,
    middleware: [
      withCompaction({
        // A share of the window rather than all of it: the system prompts,
        // the tool schemas and the reply reserve are all charged against the
        // same budget and none of them are in `messages`, so compacting only
        // once the messages alone fill the window would still overflow.
        maxTokens: compactionBudget,
        strategy: composeStrategies(
          // Cheap and lossless in meaning: keeps every turn, drops only what
          // old tool calls returned.
          clearToolResults(),
          // Costs one model call, keeps what was actually said. A reading
          // companion whose whole value is continuity should not forget the
          // book you told it about two hundred messages ago.
          summarizeOldest({
            summarize: (dropped) =>
              summarizeForCompaction({ dropped, modelId, deviceId }),
          }),
          // Last resort, if summarising failed or was not enough.
          evictOldest(),
        ),
        onCompact: (info) => {
          console.log(
            `[Compaction] ${info.messagesBefore}->${info.messagesAfter} messages, ` +
              `~${info.before}->${info.after} tokens (budget ${compactionBudget})`,
          );
        },
      }),
    ],
    modelOptions: {
      models: fallbackModels.map((model) => model.id) as any,
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

/**
 * Share of a model's context window that conversation messages may occupy.
 *
 * The rest pays for what is not in `messages` and is charged anyway: the
 * Samwell persona and the session's book grounding (`systemPrompts`), the tool
 * schemas, and the room the reply itself needs. Two thirds leaves comfortable
 * headroom on every model in the catalogue while still only compacting a
 * conversation that has genuinely run long.
 */
const CONTEXT_BUDGET_RATIO = 0.66;

const CompactionSummarySchema = z.object({
  summary: z.string(),
});

const COMPACTION_SUMMARY_PROMPT = `You are compressing the earlier part of a conversation so it can be carried forward in a smaller context window.

Write a factual summary in the third person. Preserve, in this order of priority:
- what the reader is trying to understand or decide
- any book, chapter or passage being discussed, by name
- conclusions already reached, so they are not re-litigated
- commitments or preferences the reader stated

Leave out pleasantries, restated questions, and anything already obvious from the recent messages that follow. Do not invent detail that is not present. Aim for one short paragraph.`;

/**
 * Summarise the turns compaction is about to drop.
 *
 * Metered but not counted against the reader's cap: this is machinery they did
 * not ask for, so it should not consume their quota, while still being
 * recorded because it costs real money. A failure here is not fatal —
 * `summarizeOldest` leaves the history intact and the composed strategy falls
 * through to `evictOldest`.
 */
async function summarizeForCompaction({
  dropped,
  modelId,
  deviceId,
}: {
  dropped: Array<{ role: string; content: unknown }>;
  modelId: string;
  deviceId: string;
}): Promise<string> {
  const transcript = dropped
    .map((message) => {
      const text =
        typeof message.content === 'string'
          ? message.content
          : JSON.stringify(message.content);
      return `${message.role}: ${text}`;
    })
    .join('\n\n');

  const usageEventId = `compaction-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await reserveUsageEvent({
    id: usageEventId,
    deviceId,
    modelId,
    countsTowardLimit: false,
    kind: 'compaction_summary',
  });

  const result = await runStructuredAnalysis({
    modelId,
    systemPrompts: [COMPACTION_SUMMARY_PROMPT],
    messages: [{ role: 'user', content: transcript }],
    schema: CompactionSummarySchema,
    usageEventId,
    maxCompletionTokens: 600,
    failureCode: 'compaction_summary_failed',
  });

  return result.summary;
}

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
