import { chat } from '@tanstack/ai';
import { openRouterText } from '@tanstack/ai-openrouter';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

import { updateUsageEvent } from './db.js';

/**
 * One-shot structured output, for the small background jobs.
 *
 * Chat titles and tag suggestions: no conversation, no streaming, one object
 * out. Compass used to live here too and no longer does — it is a conversation
 * with tools now, on the same route as reading chat, which is why this file
 * holds only the one-shot helper.
 */

type CapturedUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cost?: number;
};

export async function runStructuredAnalysis<TSchema extends z.ZodType>(args: {
  modelId: string;
  systemPrompts: string[];
  messages: { role: 'user' | 'assistant'; content: string }[];
  schema: TSchema;
  usageEventId: string;
  maxCompletionTokens?: number;
  /**
   * Error code returned to the client if the run fails. Every caller should
   * pass its own: a shared default in the logs sends you hunting in the wrong
   * place entirely.
   */
  failureCode?: string;
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
      console.warn(
      `[Samwell Cloud] structured analysis retrying (${args.failureCode ?? 'structured_analysis_failed'}):`,
      firstError,
    );
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
    const message = error instanceof Error ? error.message : 'Structured analysis failed.';
    console.error(
      `[Samwell Cloud] structured analysis failed (${args.failureCode ?? 'structured_analysis_failed'}):`,
      error,
    );
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
    throw new HTTPException(502, { message: args.failureCode ?? 'structured_analysis_failed' });
  }
}
