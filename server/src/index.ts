import 'dotenv/config';

import { serve } from '@hono/node-server';
import { chat, toHttpResponse, type StreamChunk } from '@tanstack/ai';
import { openRouterText } from '@tanstack/ai-openrouter';
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { logger } from 'hono/logger';
import {
  COMPASS_CLIENT_TOOL_DEFINITIONS,
  COMPASS_SYSTEM_PROMPT,
  SAMWELL_CLIENT_TOOL_DEFINITIONS,
  SAMWELL_JOURNEY_TOOL_PROMPT,
  SAMWELL_SYSTEM_PROMPT,
  resolveContextTokens,
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
import { runStructuredAnalysis } from './structured-analysis.js';
import { fetchOpenRouterModel, startModelContextRefresh } from './model-context.js';
import { tagsRoutes } from './tags.js';
import { takeawayRoutes } from './takeaway.js';
import {
  deleteCloudModel,
  getDefaultModelId,
  getUsageState,
  initDb,
  insertCloudModel,
  listCloudModels,
  resolveModelId,
  reserveUsageEvent,
  setDefaultModelToFront,
  updateCloudModel,
  updateUsageEvent,
} from './db.js';
import { requireOpenRouterKey } from './http-helpers.js';
import { readIdentity } from './identity.js';

type RunAgentInput = {
  threadId?: string;
  runId?: string;
  messages?: unknown[];
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

function readModelId(body: RunAgentInput, knownModelIds: string[]): string {
  const raw = body.forwardedProps?.modelId ?? body.data?.modelId;
  return resolveModelId(typeof raw === 'string' ? raw : undefined, knownModelIds);
}

/**
 * Which Samwell is answering: the reading companion, or Compass.
 *
 * Sent as a forwarded prop rather than inferred from the messages, because
 * the two surfaces can carry identical text and only the caller knows which
 * one it is. Anything unrecognised is reading chat, so a stale client that
 * predates Compass-over-chat still gets a working assistant.
 */
type SamwellMode = 'reading' | 'compass';

function readMode(body: RunAgentInput): SamwellMode {
  const raw = body.forwardedProps?.mode ?? body.data?.mode;
  return raw === 'compass' ? 'compass' : 'reading';
}

/*
 * The one knob the app's cloud tune sheet dials, read from the same forwarded
 * props as the model id. A hint, not contract: a stale client that sends
 * nothing gets `medium`, and one that still sends the old four-way
 * `reasoningEffort` is understood too.
 */

const THINKING_BUDGETS = ['low', 'medium', 'high'] as const;
type ThinkingBudget = (typeof THINKING_BUDGETS)[number];

function readThinkingBudget(body: RunAgentInput): ThinkingBudget {
  const raw =
    body.forwardedProps?.thinkingBudget ??
    body.data?.thinkingBudget ??
    // Older builds sent a four-way reasoning effort; `off` had no reasoning at
    // all, which the floor now does a little of.
    body.forwardedProps?.reasoningEffort ??
    body.data?.reasoningEffort;
  if ((THINKING_BUDGETS as readonly unknown[]).includes(raw)) return raw as ThinkingBudget;
  if (raw === 'off') return 'low';
  return 'medium';
}

/*
 * No `max_completion_tokens`. A response ends when the model emits its stop
 * token, and every hosted model here enforces its own output ceiling; adding
 * ours on top only gave a long-but-legitimate answer one more place to get
 * clipped — which it did, three times. Length is a prompt concern (the persona
 * tells Samwell to match the question and never pad); depth is `reasoning.effort`.
 */

function isCountableUserTurn(messages: unknown[]): boolean {
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
    // `Authorization` carries the Logto access token every metered route now
    // requires. The device header it replaced is gone: Grand Maester Samwell
    // runs on accounts, so there is nothing anonymous left to allow.
    allowHeaders: ['Content-Type', 'Authorization'],
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
    defaultModelId: await getDefaultModelId(),
  });
});

/** The single response shape every admin mutation returns, so one curl always
 * ends with the new full state in hand. */
async function adminModelState(c: Context) {
  return c.json({
    models: await listCloudModels(),
    defaultModelId: await getDefaultModelId(),
  });
}

/*
 * Model management at runtime.
 *
 * The admin sends only an identifier; label, provider, context window, and
 * capabilities are pulled from OpenRouter's model metadata (the same source
 * the background context refresh reads), so there is no second place where a
 * model's facts are written down and no deploy needed to swap one. A model ID
 * OpenRouter does not know is rejected before it can enter the fallback chain,
 * and OpenRouter being unreachable fails the mutation rather than storing a
 * half-known row.
 */
const AddModelSchema = z.object({
  id: z.string().min(1),
  makeDefault: z.boolean().optional(),
});

async function requireFetchedModel(id: string): Promise<{ model: CloudModelOption; canonicalId: string }> {
  const result = await fetchOpenRouterModel(id);
  if (result.kind === 'unknown_id') {
    throw new HTTPException(400, { message: `OpenRouter has no model with id '${id}'.` });
  }
  if (result.kind === 'unreachable') {
    throw new HTTPException(502, { message: 'Could not reach OpenRouter to verify the model.' });
  }
  return { model: result.model, canonicalId: result.canonicalId };
}

app.post('/admin/models', async (c) => {
  requireAdminKey(c);

  const body = await c.req.json();
  const parsed = AddModelSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }

  const { model, canonicalId } = await requireFetchedModel(parsed.data.id);
  const existing = await listCloudModels();
  if (existing.some((m) => m.id === canonicalId)) {
    // Idempotent: adding an existing ID refreshes its metadata in place,
    // which is also how a stale row gets re-pulled.
    await updateCloudModel(model);
  } else {
    await insertCloudModel(model);
  }
  if (parsed.data.makeDefault) {
    await setDefaultModelToFront(canonicalId);
  }
  return adminModelState(c);
});

/*
 * Model IDs contain a slash ("openai/gpt-5.6-luna"), so these params use
 * `{.+}` to capture across slashes; a plain `:id` stops at the first slash
 * and every lookup would 404.
 */

/** Re-pull a stored model's metadata from OpenRouter. */
app.patch('/admin/models/:id{.+}', async (c) => {
  requireAdminKey(c);

  const id = c.req.param('id');
  const known = await listCloudModels();
  if (!known.some((m) => m.id === id)) {
    throw new HTTPException(404, { message: `Model '${id}' is not in the catalog.` });
  }

  const { model } = await requireFetchedModel(id);
  await updateCloudModel(model);
  return adminModelState(c);
});

app.delete('/admin/models/:id{.+}', async (c) => {
  requireAdminKey(c);

  const id = c.req.param('id');
  const known = await listCloudModels();
  if (!known.some((m) => m.id === id)) {
    throw new HTTPException(404, { message: `Model '${id}' is not in the catalog.` });
  }

  await deleteCloudModel(id);
  return adminModelState(c);
});

app.put('/admin/models/default', async (c) => {
  requireAdminKey(c);

  const body = await c.req.json();
  const parsed = z.object({ id: z.string().min(1) }).safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }

  const known = await listCloudModels();
  if (!known.some((m) => m.id === parsed.data.id)) {
    throw new HTTPException(404, { message: `Model '${parsed.data.id}' is not in the catalog.` });
  }

  await setDefaultModelToFront(parsed.data.id);
  return adminModelState(c);
});

app.get('/usage', async (c) => {
  const { id: accountId } = await readIdentity(c);
  return c.json(await getUsageState(accountId));
});

app.route('/tags', tagsRoutes);
app.route('/chat', chatTitleRoutes);
// The reconciliation of a goal that just ended, beside the Compass routes it
// belongs to.
app.route('/compass', takeawayRoutes);

app.post('/chat/http', async (c) => {
  requireOpenRouterKey();

  const { id: accountId } = await readIdentity(c);
  const body = (await c.req.json()) as RunAgentInput;
  if (!Array.isArray(body.messages)) {
    throw new HTTPException(400, { message: 'messages must be an array.' });
  }

  const countsTowardLimit = isCountableUserTurn(body.messages);
  const mode = readMode(body);

  const rawMessages = body.messages as { role?: string; content?: unknown }[];
  const sessionSystemPrompts = rawMessages
    .filter((m) => m?.role === 'system' && typeof m.content === 'string' && m.content.trim())
    .map((m) => m.content as string);
  const conversationMessages = rawMessages.filter((m) => m?.role !== 'system');

  const knownModels = await listCloudModels();
  const knownModelIds = knownModels.map((model) => model.id);
  const modelId = readModelId(body, knownModelIds);
  const thinkingBudget = readThinkingBudget(body);
  const usageEventId =
    body.runId ?? `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const reservation = await reserveUsageEvent({
    id: usageEventId,
    accountId,
    modelId,
    countsTowardLimit,
    // Metered separately so Compass spend is legible in the usage record,
    // even though it now travels the same route as reading chat.
    ...(mode === 'compass' ? { kind: 'compass_chat' } : {}),
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
    /*
     * The only difference between reading chat and Compass.
     *
     * Same transport, same streaming, same compaction, same fallback chain,
     * same reasoning. What changes is which part of the user's life Samwell is
     * turned toward and which tools he can reach for, which is what the two
     * surfaces were always supposed to differ by. Compass used to be a
     * separate structured-output route, and everything unstable about it came
     * from that separation rather than from anything Compass does.
     */
    systemPrompts: [
      // Compass names search_journey in its own prompt, since Compass only
      // ever runs here. The reading persona is shared with the on-device
      // engine, so the journey paragraph is added on this route alone.
      ...(mode === 'compass'
        ? [COMPASS_SYSTEM_PROMPT]
        : [SAMWELL_SYSTEM_PROMPT, SAMWELL_JOURNEY_TOOL_PROMPT]),
      ...sessionSystemPrompts,
    ],
    tools: mode === 'compass' ? COMPASS_CLIENT_TOOL_DEFINITIONS : SAMWELL_CLIENT_TOOL_DEFINITIONS,
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
              summarizeForCompaction({ dropped, modelId, accountId }),
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
      toolChoice: 'auto',
      parallelToolCalls: false,
      /*
       * Ask for the reasoning back rather than leaving it internal, at the
       * effort the thinking budget names — the app's `low`/`medium`/`high` are
       * OpenRouter's own effort scale, so this is a pass-through.
       *
       * OpenRouter returns reasoning only when the request asks for it, so a
       * reasoning model's thinking was being spent and thrown away. `effort`
       * is the only reasoning field the OpenRouter SDK forwards (it strips the
       * rest), and supplying it is itself what enables reasoning. A model that
       * cannot reason ignores it and emits no reasoning deltas, which is what
       * makes this safe to send down the whole fallback chain rather than
       * gating on a capability flag the catalogue does not carry.
       */
      reasoning: { effort: thinkingBudget },
    },
  });

  console.log(
    `[Samwell Cloud] ${mode} turn: model=${modelId} thinkingBudget=${thinkingBudget}`,
  );

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
  accountId,
}: {
  dropped: { role: string; content: unknown }[];
  modelId: string;
  accountId: string;
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
    accountId,
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
