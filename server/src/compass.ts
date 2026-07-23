import { chat } from '@tanstack/ai';
import { openRouterText } from '@tanstack/ai-openrouter';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  COMPASS_ENGINEER_PROMPT,
  COMPASS_MORNING_INSTRUCTIONS,
  COMPASS_NIGHT_INSTRUCTIONS,
  COMPASS_SETUP_INSTRUCTIONS,
  CompassMorningAnalysisSchema,
  CompassMorningRequestSchema,
  CompassNightAnalysisSchema,
  CompassNightRequestSchema,
  CompassSetupProposalSchema,
  CompassSetupRequestSchema,
  DEFAULT_CLOUD_MODEL_ID,
} from 'samwell-shared';
import { z } from 'zod';

import {
  checkUsageLimit,
  createUsageEvent,
  listCloudModels,
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
  userContent: string;
  schema: TSchema;
  usageEventId: string;
  maxCompletionTokens?: number;
}): Promise<z.infer<TSchema>> {
  let usage: CapturedUsage | undefined;

  const attempt = (): Promise<z.infer<TSchema>> =>
    chat({
      adapter: openRouterText(args.modelId as any, {
        httpReferer: process.env.OPENROUTER_HTTP_REFERER,
        appTitle: process.env.OPENROUTER_APP_TITLE ?? 'Open Citadel',
      }),
      messages: [{ role: 'user', content: args.userContent }],
      systemPrompts: args.systemPrompts,
      outputSchema: args.schema,
      middleware: [
        {
          onUsage: (_ctx, reported) => {
            usage = {
              promptTokens: reported.promptTokens,
              completionTokens: reported.completionTokens,
              totalTokens: reported.totalTokens,
              cost: reported.cost,
            };
          },
        },
      ],
      modelOptions: {
        temperature: 0.2,
        maxCompletionTokens: args.maxCompletionTokens ?? 1000,
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
      promptTokens: usage?.promptTokens ?? null,
      completionTokens: usage?.completionTokens ?? null,
      totalTokens: usage?.totalTokens ?? null,
      costUsd: usage?.cost ?? null,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Compass analysis failed.';
    console.error('[Samwell Cloud] Compass analysis failed:', error);
    await updateUsageEvent(args.usageEventId, {
      status: 'errored',
      error: message,
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

    const knownModels = await listCloudModels();
    const modelId = resolveModelId(
      parsed.data.modelId,
      knownModels.map((model) => model.id),
    );
    const usageEventId = `compass-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    await createUsageEvent({
      id: usageEventId,
      deviceId,
      modelId,
      countsTowardLimit: true,
      kind: args.kind,
    });

    const { modelId: _requestedModel, ...payload } = parsed.data;
    const result = await runStructuredAnalysis({
      modelId,
      systemPrompts: [COMPASS_ENGINEER_PROMPT, args.instructions],
      userContent: JSON.stringify(payload),
      schema: args.outputSchema,
      usageEventId,
    });

    return c.json(result);
  });
}

registerAnalysisRoute({
  path: '/setup',
  kind: 'compass_setup',
  requestSchema: CompassSetupRequestSchema,
  outputSchema: CompassSetupProposalSchema,
  instructions: COMPASS_SETUP_INSTRUCTIONS,
});

registerAnalysisRoute({
  path: '/morning',
  kind: 'compass_morning',
  requestSchema: CompassMorningRequestSchema,
  outputSchema: CompassMorningAnalysisSchema,
  instructions: COMPASS_MORNING_INSTRUCTIONS,
});

registerAnalysisRoute({
  path: '/night',
  kind: 'compass_night',
  requestSchema: CompassNightRequestSchema,
  outputSchema: CompassNightAnalysisSchema,
  instructions: COMPASS_NIGHT_INSTRUCTIONS,
});
