import { chat } from '@tanstack/ai';
import { openRouterText } from '@tanstack/ai-openrouter';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  encodeCompassEvent,
  readJsonStringField,
  type CompassStreamEvent,
  COMPASS_CHECKIN_INSTRUCTIONS,
  COMPASS_ENGINEER_PROMPT,
  COMPASS_PLAN_INSTRUCTIONS,
  COMPASS_TURN_PROTOCOL,
  CompassCheckinTurnModelSchema,
  CompassCheckinTurnRequestSchema,
  CompassCheckinTurnSchema,
  CompassPlanTurnModelSchema,
  CompassPlanTurnRequestSchema,
  CompassPlanTurnSchema,
  normalizeCompassCheckinTurn,
  normalizeCompassPlanTurn,
} from 'samwell-shared';
import { z } from 'zod';

import {
  listCloudModels,
  reserveUsageEvent,
  resolveModelId,
  updateUsageEvent,
} from './db.js';
import { readDeviceId, requireOpenRouterKey } from './http-helpers.js';

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
   * Error code returned to the client if the run fails. Defaults to the
   * Compass one because Compass was the first caller, but this helper is
   * shared — chat titles and tag suggestions route through it too, and a
   * `compass_analysis_failed` in those logs sends you hunting in the wrong
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
      `[Samwell Cloud] structured analysis retrying (${args.failureCode ?? 'compass_analysis_failed'}):`,
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
    const message = error instanceof Error ? error.message : 'Compass analysis failed.';
    console.error(
      `[Samwell Cloud] structured analysis failed (${args.failureCode ?? 'compass_analysis_failed'}):`,
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
    throw new HTTPException(502, { message: args.failureCode ?? 'compass_analysis_failed' });
  }
}

/**
 * One streaming attempt at a structured turn.
 *
 * The reply is the first field of `{ reply, draft }` and the model writes the
 * document in schema order, so it is decodable from a prefix long before the
 * draft exists. `readJsonStringField` turns each partial document into "what
 * does reply say so far", and the difference against what has already been sent
 * is the delta. Deltas are computed from the decoded value rather than forwarded
 * raw, because the raw bytes are JSON: forwarding them would put quotes,
 * backslashes and `\n` on screen.
 */
async function streamAttempt(args: {
  modelId: string;
  systemPrompts: string[];
  messages: { role: 'user' | 'assistant'; content: string }[];
  schema: z.ZodType;
  /** The model's reasoning, forwarded as it is produced. */
  onThinking: (delta: string) => void;
  onReply: (delta: string) => void;
  /** Fired the moment the reply's closing quote lands, which may be well
   *  before the run finishes or fails. The caller's retry policy turns on it,
   *  so it cannot wait for a return value that a throw will never produce. */
  onReplyClosed: () => void;
  onUsage: (reported: CapturedUsage) => void;
  /** Fired when the reader goes away, to stop the run mid-flight. */
  abortController: AbortController;
}): Promise<{ object: unknown; reply: string }> {
  let raw = '';
  let sent = '';
  let replyClosed = false;
  let object: unknown;
  let runError: string | undefined;
  let finishReason: string | undefined;

  const stream = (await chat({
    adapter: openRouterText(args.modelId as any, {
      httpReferer: process.env.OPENROUTER_HTTP_REFERER,
      appTitle: process.env.OPENROUTER_APP_TITLE ?? 'Open Citadel',
    }),
    messages: args.messages,
    systemPrompts: args.systemPrompts,
    outputSchema: args.schema,
    stream: true,
    abortController: args.abortController,
    middleware: [{ onUsage: (_ctx, reported) => args.onUsage(reported) }],
    modelOptions: {
      temperature: 0.2,
      /*
       * Ask for the reasoning back rather than leaving it internal.
       *
       * OpenRouter returns reasoning only when the request asks for it, and
       * this turn is almost entirely reasoning: measured against the live
       * server, a plan turn was silent for 3.8s and then wrote its whole reply
       * in 220ms. Without this the reader watches an orb for the part that
       * takes the time and gets the answer in a blink.
       *
       * `enabled` rather than an `effort` level, so each model keeps its own
       * default depth instead of every model being pushed to the same one. A
       * model that cannot reason ignores it, emits no reasoning deltas, and
       * the surface falls back to the orb.
       */
      reasoning: { enabled: true },
    },
  })) as AsyncIterable<any>;

  for await (const chunk of stream) {
    /*
     * Reasoning arrives on the same structured-output stream as the JSON, and
     * arrives first. Dropping it was why a Compass turn looked like it had
     * hung: everything the model was doing for the length of the wait went
     * into a chunk type nobody handled.
     */
    if (chunk.type === 'REASONING_MESSAGE_CONTENT' && typeof chunk.delta === 'string') {
      args.onThinking(chunk.delta);
    } else if (chunk.type === 'TEXT_MESSAGE_CONTENT' && typeof chunk.delta === 'string') {
      raw += chunk.delta;
      const read = readJsonStringField(raw, 'reply');
      if (!read) continue;
      // Only ever forward growth. A decoder that held back an unfinished
      // escape reports the same value twice, and a shorter value would mean
      // the document was rewritten, which cannot happen in a stream.
      if (read.value.length > sent.length && read.value.startsWith(sent)) {
        args.onReply(read.value.slice(sent.length));
        sent = read.value;
      }
      if (read.closed && !replyClosed) {
        replyClosed = true;
        args.onReplyClosed();
      }
    } else if (chunk.type === 'CUSTOM' && chunk.name === 'structured-output.complete') {
      object = chunk.value?.object;
    } else if (chunk.type === 'RUN_ERROR') {
      // The real reason, which used to be swallowed: without this every
      // upstream failure came out as "structured output never completed",
      // which says only that we noticed.
      runError = (chunk as { message?: string }).message ?? 'run error';
    } else if (chunk.type === 'RUN_FINISHED') {
      finishReason = (chunk as { finishReason?: string }).finishReason;
    }
  }

  if (object === undefined) {
    /*
     * The terminal event never came, but the document might still be whole:
     * the run can end without the library emitting `structured-output.complete`
     * while the JSON it was accumulating is perfectly parseable. Salvaging it
     * here turns a failed turn into a good one, and costs a parse of a string
     * we already hold.
     */
    try {
      const salvaged: unknown = JSON.parse(raw);
      if (salvaged && typeof salvaged === 'object') return { object: salvaged, reply: sent };
    } catch {
      // Genuinely incomplete. Fall through and say why.
    }
    throw new Error(
      runError ??
        `structured output never completed (finishReason=${finishReason ?? 'none'}, ` +
          `chars=${raw.length}, replyClosed=${replyClosed})`,
    );
  }
  return { object, reply: sent };
}

export const compassRoutes = new Hono();

function registerAnalysisRoute<TSchema extends z.ZodType>(args: {
  path: string;
  kind: 'compass_plan' | 'compass_checkin';
  requestSchema: z.ZodType<{ modelId?: string | undefined } & Record<string, unknown>>;
  outputSchema: TSchema;
  /**
   * Schema the MODEL's raw output is validated against, when it is looser
   * than the wire contract — the same pattern as SuggestChatTitleModelSchema.
   * Must be paired with `normalize`. Defaults to validating the model
   * directly against the strict `outputSchema`.
   */
  modelOutputSchema?: z.ZodType;
  /** Trims loose model output down to the strict `outputSchema` contract.
   * Takes `any` so typed normalizers like `normalizeCompassMorningTurn` fit
   * without cast gymnastics — the input has already been validated against
   * `modelOutputSchema` by the time it gets here. */
  normalize?: (raw: any, context: Record<string, unknown>) => z.infer<TSchema>;
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
      messages: { role: 'user' | 'assistant'; content: string }[];
    } & Record<string, unknown>;

    const systemPrompts = [
      COMPASS_ENGINEER_PROMPT,
      COMPASS_TURN_PROTOCOL,
      args.instructions,
      `Current context (JSON):\n${JSON.stringify(context)}`,
    ];
    const schema = (args.modelOutputSchema ?? args.outputSchema) as z.ZodType;

    /*
     * Accumulated across attempts, not overwritten: a retry follows an attempt
     * that already burned billed tokens. Keeping only the last attempt's
     * numbers would drop real spend out of the metering record.
     */
    let usage: CapturedUsage = {};
    let usageRecorded = false;
    const recordUsage = (reported: CapturedUsage) => {
      usageRecorded = true;
      usage = {
        promptTokens: (usage.promptTokens ?? 0) + (reported.promptTokens ?? 0),
        completionTokens: (usage.completionTokens ?? 0) + (reported.completionTokens ?? 0),
        totalTokens: (usage.totalTokens ?? 0) + (reported.totalTokens ?? 0),
        cost: (usage.cost ?? 0) + (reported.cost ?? 0),
      };
    };
    const billed = () => ({
      promptTokens: usageRecorded ? (usage.promptTokens ?? null) : null,
      completionTokens: usageRecorded ? (usage.completionTokens ?? null) : null,
      totalTokens: usageRecorded ? (usage.totalTokens ?? null) : null,
      costUsd: usageRecorded ? (usage.cost ?? null) : null,
    });

    /*
     * Newline-delimited JSON rather than TanStack's `toServerSentEventsResponse`.
     * That helper forwards their event stream verbatim, which is right when a
     * TanStack client is on the other end. This route sends something smaller
     * and already chewed: the reply decoded out of the JSON, and the turn after
     * normalization, which can only happen here because it needs the request's
     * own context. `application/x-ndjson` is also what /chat/http already
     * speaks, so the app has one streaming transport rather than two.
     */
    const encoder = new TextEncoder();
    /*
     * Whether anybody is still reading. A reader that closes the sheet, drops
     * off the network, or hits the client's own timeout cancels the stream,
     * and every `enqueue` after that throws ERR_INVALID_STATE.
     *
     * That has to be its own state rather than an exception, because an
     * exception here is indistinguishable from the model failing — and the
     * retry below would answer a disconnected reader by billing a second run.
     */
    let clientGone = false;
    const abortController = new AbortController();

    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: CompassStreamEvent) => {
          if (clientGone) return;
          try {
            controller.enqueue(encoder.encode(encodeCompassEvent(event)));
          } catch {
            // The only way an enqueue fails is a stream that has stopped
            // accepting writes, which means the reader has gone.
            clientGone = true;
            abortController.abort();
          }
        };

        /** How much of the reply the client has been shown, this attempt. */
        let shown = '';
        /** Whether that reply is a finished message rather than a fragment. */
        let replyComplete = false;

        const finish = async (turn: unknown) => {
          await updateUsageEvent(usageEventId, { status: 'completed', ...billed() });
          send({ type: 'done', turn });
        };

        try {
          let attemptsLeft = 2;
          for (;;) {
            attemptsLeft -= 1;
            try {
              const result = await streamAttempt({
                modelId,
                systemPrompts,
                messages,
                schema,
                onThinking: (delta) => send({ type: 'thinking', delta }),
                onReply: (delta) => {
                  shown += delta;
                  send({ type: 'reply', delta });
                },
                onReplyClosed: () => {
                  replyComplete = true;
                },
                onUsage: recordUsage,
                abortController,
              });
              /*
               * Validated here, not by the library. The streaming path does
               * not run schema validation (TanStack's own docs: "validate the
               * completed object in the consumer when required"), so
               * `structured-output.complete` carries parsed JSON that has
               * never been checked against the contract. Without this a
               * malformed draft would reach the normalizer and then the
               * device. It is also what makes the retry below fire.
               */
              const parsedOutput = schema.parse(result.object);
              await finish(args.normalize ? args.normalize(parsedOutput, context) : parsedOutput);
              return;
            } catch (attemptError) {
              /*
               * Nobody is listening. There is no one to show a retry to and no
               * one to show an error to, so the only honest thing left is to
               * record what was billed and stop.
               */
              if (clientGone) {
                console.warn(`[Samwell Cloud] compass turn abandoned (${args.kind})`);
                await updateUsageEvent(usageEventId, {
                  status: 'errored',
                  error: 'client disconnected',
                  ...billed(),
                });
                return;
              }
              /*
               * The reply arrived in full before this failed, so the message on
               * screen is whole and the reader has read it. Replacing it with a
               * different one is worse than losing the proposal, which Samwell
               * can make again next turn.
               */
              if (replyComplete && shown.length > 0) {
                console.warn(
                  `[Samwell Cloud] compass draft lost after a complete reply (${args.kind}):`,
                  attemptError,
                );
                await finish({ reply: shown, draft: null });
                return;
              }
              if (attemptsLeft <= 0) throw attemptError;
              console.warn(`[Samwell Cloud] compass turn retrying (${args.kind}):`, attemptError);
              // Nothing on screen was ever a finished message, so it can go.
              if (shown.length > 0) send({ type: 'restart' });
              shown = '';
              replyComplete = false;
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Compass turn failed.';
          console.error(`[Samwell Cloud] compass turn failed (${args.kind}):`, error);
          await updateUsageEvent(usageEventId, {
            status: 'errored',
            error: message,
            ...billed(),
          });
          send({ type: 'error', code: 'compass_analysis_failed', reason: message });
        } finally {
          if (!clientGone) {
            try {
              controller.close();
            } catch {
              // Closed under us between the last write and here.
            }
          }
        }
      },
      cancel() {
        clientGone = true;
        abortController.abort();
      },
    });

    return new Response(body, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    });
  });
}

registerAnalysisRoute({
  path: '/plan',
  kind: 'compass_plan',
  requestSchema: CompassPlanTurnRequestSchema,
  outputSchema: CompassPlanTurnSchema,
  // The goal proposal is the largest structured output this app asks for — a
  // goal wrapping up to five trackables, each with its own schedule and
  // measurement. Holding the model to the strict discriminated unions throws
  // away an otherwise good conversation over one stray key, so it answers in
  // the flat nullable shape and the normalizer rebuilds the real thing.
  modelOutputSchema: CompassPlanTurnModelSchema,
  normalize: (raw, context) => {
    const ctx = (context.context ?? {}) as { today?: string; timezone?: string };
    return normalizeCompassPlanTurn(raw, {
      today: ctx.today ?? new Date().toISOString().slice(0, 10),
      timezone: ctx.timezone ?? 'UTC',
    });
  },
  instructions: COMPASS_PLAN_INSTRUCTIONS,
});

registerAnalysisRoute({
  path: '/checkin',
  kind: 'compass_checkin',
  requestSchema: CompassCheckinTurnRequestSchema,
  outputSchema: CompassCheckinTurnSchema,
  modelOutputSchema: CompassCheckinTurnModelSchema,
  // An adjustment naming a trackable that does not exist cannot be approved,
  // so it is dropped here rather than shown as a button that does nothing.
  normalize: (raw, context) => {
    const ctx = (context.context ?? {}) as { trackables?: { id: string }[] };
    return normalizeCompassCheckinTurn(raw, (ctx.trackables ?? []).map((t) => t.id));
  },
  instructions: COMPASS_CHECKIN_INSTRUCTIONS,
});
