import { chat } from '@tanstack/ai';
import { openRouterText } from '@tanstack/ai-openrouter';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  COMPASS_ENGINEER_PROMPT,
  COMPASS_MORNING_INSTRUCTIONS,
  COMPASS_NIGHT_INSTRUCTIONS,
  COMPASS_SETUP_INSTRUCTIONS,
  COMPASS_TURN_PROTOCOL,
  CompassMorningTurnRequestSchema,
  CompassMorningTurnSchema,
  CompassNightTurnRequestSchema,
  CompassNightTurnSchema,
  CompassSetupTurnRequestSchema,
  CompassSetupTurnSchema,
  DEFAULT_CLOUD_MODEL_ID,
} from 'samwell-shared';
import { z } from 'zod';

import {
  listCloudModels,
  reserveUsageEvent,
  updateUsageEvent,
} from './db.js';
import { readDeviceId, requireOpenRouterKey } from './http-helpers.js';

type CapturedUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cost?: number;
};

function resolveModelId(requested: string | undefined, knownModelIds: string[]): string {
  const modelId = requested ?? DEFAULT_CLOUD_MODEL_ID;
  return knownModelIds.includes(modelId) ? modelId : (knownModelIds[0] ?? DEFAULT_CLOUD_MODEL_ID);
}

export async function runStructuredAnalysis<TSchema extends z.ZodType>(args: {
  modelId: string;
  systemPrompts: string[];
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  schema: TSchema;
  usageEventId: string;
  maxCompletionTokens?: number;
}): Promise<z.infer<TSchema>> {
  // Accumulated across attempts, not overwritten: a retry can follow a first
  // attempt that already burned real, billed tokens (it replied, but the
  // reply failed structured-output validation). If we kept only the latest
  // attempt's numbers, the first attempt's actual spend would silently vanish
  // from the metering record while still having been billed by the provider.
  let usage: CapturedUsage = {};
  let usageRecorded = false;

  const attempt = (): Promise<z.infer<TSchema>> =>
    chat({
      adapter: openRouterText(args.modelId as any, {
        httpReferer: process.env.OPENROUTER_HTTP_REFERER,
        appTitle: process.env.OPENROUTER_APP_TITLE ?? 'Open Citadel',
      }),
      messages: args.messages,
      systemPrompts: args.systemPrompts,
      outputSchema: args.schema,
      middleware: [
        {
          onUsage: (_ctx, reported) => {
            usageRecorded = true;
            usage = {
              promptTokens: (usage.promptTokens ?? 0) + (reported.promptTokens ?? 0),
              completionTokens: (usage.completionTokens ?? 0) + (reported.completionTokens ?? 0),
              totalTokens: (usage.totalTokens ?? 0) + (reported.totalTokens ?? 0),
              cost: (usage.cost ?? 0) + (reported.cost ?? 0),
            };
          },
        },
      ],
      modelOptions: {
        temperature: 0.2,
        // No default cap: reasoning-capable models (our default is a GPT-5 chat
        // model) spend completion tokens on hidden reasoning before they ever write
        // the JSON, so a bounded budget runs out mid-thought on longer turns and the
        // structured output never validates — intermittently, since reasoning length
        // varies per turn. Callers that genuinely want a ceiling can still pass one.
        ...(args.maxCompletionTokens != null
          ? { maxCompletionTokens: args.maxCompletionTokens }
          : {}),
      },
    }) as Promise<z.infer<TSchema>>;

  try {
    let result: z.infer<TSchema>;
    try {
      result = await attempt();
    } catch (firstError) {
      console.warn('[Samwell Cloud] Compass analysis retrying after failure:', firstError);
      result = await attempt();
    }

    await updateUsageEvent(args.usageEventId, {
      status: 'completed',
      promptTokens: usageRecorded ? (usage.promptTokens ?? null) : null,
      completionTokens: usageRecorded ? (usage.completionTokens ?? null) : null,
      totalTokens: usageRecorded ? (usage.totalTokens ?? null) : null,
      costUsd: usageRecorded ? (usage.cost ?? null) : null,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Compass analysis failed.';
    console.error('[Samwell Cloud] Compass analysis failed:', error);
    // Even a fully-failed run (both attempts exhausted) may have consumed
    // real tokens on the failed attempt(s) — record whatever was billed
    // rather than losing it just because no attempt ultimately validated.
    await updateUsageEvent(args.usageEventId, {
      status: 'errored',
      error: message,
      promptTokens: usageRecorded ? (usage.promptTokens ?? null) : null,
      completionTokens: usageRecorded ? (usage.completionTokens ?? null) : null,
      totalTokens: usageRecorded ? (usage.totalTokens ?? null) : null,
      costUsd: usageRecorded ? (usage.cost ?? null) : null,
    });
    throw new HTTPException(502, { message: 'compass_analysis_failed' });
  }
}

export const compassRoutes = new Hono();

function registerAnalysisRoute<TSchema extends z.ZodType>(args: {
  path: string;
  kind: 'compass_setup' | 'compass_morning' | 'compass_night';
  requestSchema: z.ZodType<{ modelId?: string | undefined } & Record<string, unknown>>;
  outputSchema: TSchema;
  instructions: string;
}): void {
  compassRoutes.post(args.path, async (c) => {
    requireOpenRouterKey();
    const deviceId = readDeviceId(c);

    const parsed = args.requestSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      throw new HTTPException(400, { message: parsed.error.message });
    }

    const knownModels = await listCloudModels();
    const modelId = resolveModelId(
      parsed.data.modelId,
      knownModels.map((model) => model.id),
    );
    const usageEventId = `compass-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const reservation = await reserveUsageEvent({
      id: usageEventId,
      deviceId,
      modelId,
      countsTowardLimit: true,
      kind: args.kind,
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

    const { modelId: _requestedModel, messages, ...context } = parsed.data as {
      modelId?: string;
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    } & Record<string, unknown>;
    const result = await runStructuredAnalysis({
      modelId,
      systemPrompts: [
        COMPASS_ENGINEER_PROMPT,
        COMPASS_TURN_PROTOCOL,
        args.instructions,
        `Current context (JSON):\n${JSON.stringify(context)}`,
      ],
      messages,
      schema: args.outputSchema,
      usageEventId,
    });

    return c.json(result);
  });
}

registerAnalysisRoute({
  path: '/setup',
  kind: 'compass_setup',
  requestSchema: CompassSetupTurnRequestSchema,
  outputSchema: CompassSetupTurnSchema,
  instructions: COMPASS_SETUP_INSTRUCTIONS,
});

registerAnalysisRoute({
  path: '/morning',
  kind: 'compass_morning',
  requestSchema: CompassMorningTurnRequestSchema,
  outputSchema: CompassMorningTurnSchema,
  instructions: COMPASS_MORNING_INSTRUCTIONS,
});

registerAnalysisRoute({
  path: '/night',
  kind: 'compass_night',
  requestSchema: CompassNightTurnRequestSchema,
  outputSchema: CompassNightTurnSchema,
  instructions: COMPASS_NIGHT_INSTRUCTIONS,
});
