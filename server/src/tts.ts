/**
 * `POST /tts/speak`: one piece of a book, read aloud by a cloud voice.
 *
 * The same metering shape as `/chat/http` in `index.ts`, shortened to what a
 * sentence needs: who is asking, whether their plan reaches this voice, an
 * event row, a one-credit hold so an empty balance is refused before the maker
 * is paid, then the audio streamed straight through as it arrives, so the
 * reader hears the first words while the rest is still being made. The charge
 * is settled after the stream ends, off the audio path, at OpenRouter's own
 * figure for the generation (`tts-billing.ts` keeps the fractions).
 *
 * Built from injected parts so the tests can run the whole route against a
 * throwaway database and a fake maker. `ttsRoutes` at the bottom is the
 * production wiring.
 */
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { planIncludes, ttsCostUsd, type CloudVoiceModel, type PlanId } from 'samwell-shared';
import { z } from 'zod';

import type { BillingService } from './billing.js';
import type { SpeechCharging } from './tts-billing.js';
import type { SpeechGuards } from './tts-guards.js';
import { lookupGenerationCost, parseAudioFormat, requestSpeech } from './tts-upstream.js';
import type { UsageEventUpdate } from './db.js';

export interface TtsDeps {
  identify(c: Context): Promise<{ id: string }>;
  billing: Pick<BillingService, 'readEntitlement' | 'reserveCredits' | 'releaseReservation'>;
  charging: SpeechCharging;
  findVoiceModel(id: string): Promise<CloudVoiceModel | null>;
  recordUsageEvent(args: { id: string; accountId: string; modelId: string; countsTowardLimit: boolean; kind: string }): Promise<void>;
  updateUsageEvent(id: string, update: UsageEventUpdate): Promise<void>;
  guards: SpeechGuards;
  apiKey(): string | undefined;
  fetchImpl?: typeof fetch;
  /** Waits between cost lookups; the tests make it instant. */
  wait?: (ms: number) => Promise<void>;
  /** Called with each settle's promise, so the tests can await what production does not. */
  onSettled?: (settling: Promise<void>) => void;
}

const SpeakSchema = z.object({
  modelId: z.string().min(1).max(200),
  voice: z.string().min(1).max(100),
  text: z.string().min(1),
  speed: z.number().min(0.5).max(2).optional(),
  /*
   * What the app can play. PCM is the default and what an older build asks
   * for: its JS turns it into samples itself. A build whose native player can
   * decode MP3 asks for that instead, which is about a tenth of the bytes.
   */
  format: z.enum(['pcm', 'mp3']).optional(),
});

export function createTtsRoutes(deps: TtsDeps): Hono {
  const routes = new Hono();

  routes.post('/speak', async (c) => {
    const apiKey = deps.apiKey();
    if (!apiKey) {
      throw new HTTPException(500, { message: 'OPENROUTER_API_KEY is not configured on the server.' });
    }
    const { id: accountId } = await deps.identify(c);

    const parsed = SpeakSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_request', message: parsed.error.message }, 400);
    const { modelId, voice, text, speed, format: wanted = 'pcm' } = parsed.data;

    const model = await deps.findVoiceModel(modelId);
    if (!model) return c.json({ error: 'unknown_voice_model', modelId }, 404);
    if (!model.voices.includes(voice)) return c.json({ error: 'unknown_voice', voice }, 400);
    if (text.length > model.maxCharacters) {
      return c.json({ error: 'text_too_long', maxCharacters: model.maxCharacters }, 413);
    }

    const entitlement = await deps.billing.readEntitlement(accountId);
    const plan: PlanId | null = entitlement.plan;
    if (!plan) return c.json({ error: 'no_subscription', message: 'Cloud voices come with every plan.' }, 402);
    if (!planIncludes(plan, model.minPlan)) {
      return c.json({ error: 'plan_required', plan: model.minPlan }, 403);
    }
    const listedCost = ttsCostUsd(text.length, model);
    // An unpriced voice cannot be charged, and charging nothing is the one
    // way to lose money quietly.
    if (listedCost == null) return c.json({ error: 'model_unpriced', modelId }, 503);

    const admitted = deps.guards.admit(accountId, text.length);
    if (!admitted.allowed) return c.json({ error: admitted.reason }, 429);

    const usageEventId = `tts-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const refuse = async (body: Record<string, unknown>, status: 402 | 502 | 503) => {
      admitted.release(true);
      await deps.updateUsageEvent(usageEventId, { status: 'errored', error: `Refused: ${String(body.error)}` });
      return c.json(body, status);
    };

    await deps.recordUsageEvent({ id: usageEventId, accountId, modelId, countsTowardLimit: true, kind: 'tts' });
    /*
     * One credit, whatever the piece. Enough to refuse a reader with nothing
     * left before the maker is paid; the real charge is usually a fraction of
     * it and is settled from the remainder, never from this.
     */
    const reserve = await deps.billing.reserveCredits({ accountId, usageEventId, credits: 1 });
    if (!reserve.allowed) {
      return refuse(
        reserve.reason === 'insufficient_credits'
          ? { error: 'insufficient_credits', available: reserve.available }
          : { error: 'no_subscription', message: 'Cloud voices come with every plan.' },
        402,
      );
    }

    let upstream: Response;
    try {
      upstream = await requestSpeech(
        // Speed goes to a maker that takes it, and only when it is not 1.
        { modelId, voice, text, format: wanted, speed: model.speedSupported && speed != null && speed !== 1 ? speed : undefined },
        { apiKey, fetchImpl: deps.fetchImpl, signal: c.req.raw.signal },
      );
    } catch (error) {
      await deps.billing.releaseReservation({ usageEventId, error: `Maker unreachable: ${String(error)}` });
      admitted.release(true);
      return c.json({ error: 'maker_failed' }, 502);
    }

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => '');
      console.warn(`[TTS] ${modelId} answered ${upstream.status}: ${detail.slice(0, 300)}`);
      await deps.billing.releaseReservation({ usageEventId, error: `Maker answered ${upstream.status}` });
      admitted.release(true);
      // Busy is worth telling apart: it is the one a short wait fixes.
      return c.json({ error: upstream.status === 429 ? 'maker_busy' : 'maker_failed', status: upstream.status }, upstream.status === 429 ? 503 : 502);
    }

    const format = parseAudioFormat(upstream.headers.get('content-type'));
    const generationId = upstream.headers.get('x-generation-id');
    const reader = upstream.body.getReader();
    let bytes = 0;
    let finished = false;

    const finish = (outcome: 'complete' | 'cancelled' | 'failed') => {
      if (finished) return;
      finished = true;
      admitted.release(outcome === 'failed' && bytes === 0);
      const settling = settlePiece(outcome).catch((error) => {
        console.error(`[TTS] Settling ${usageEventId} failed:`, error);
      });
      deps.onSettled?.(settling);
    };

    /*
     * What the piece is charged. OpenRouter's own figure when it can be had,
     * because a maker can route to an endpoint dearer than the listed one
     * (Kokoro on Together is six and a half times DeepInfra). The listed price
     * when it cannot. Nothing at all only when the maker never sent a byte
     * and OpenRouter has no record of charging us.
     */
    async function settlePiece(outcome: 'complete' | 'cancelled' | 'failed'): Promise<void> {
      const actual = generationId
        ? await lookupGenerationCost(generationId, { apiKey: apiKey as string, fetchImpl: deps.fetchImpl, wait: deps.wait })
        : null;
      if (actual == null && bytes === 0) {
        await deps.billing.releaseReservation({ usageEventId, error: `Piece ${outcome} before any audio` });
        return;
      }
      await deps.charging.settleSpeech({
        usageEventId,
        accountId,
        plan: plan as PlanId,
        costUsd: actual ?? (listedCost as number),
        description: `Read aloud, ${model?.label ?? modelId}`,
      });
    }

    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            finish('complete');
            return;
          }
          bytes += value.byteLength;
          controller.enqueue(value);
        } catch (error) {
          controller.error(error);
          finish('failed');
        }
      },
      cancel(reason) {
        void reader.cancel(reason).catch(() => undefined);
        finish('cancelled');
      },
    });

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
        'X-Audio-Format': format.kind,
        'X-Audio-Sample-Rate': String(format.sampleRate),
        'X-Audio-Channels': String(format.channels),
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
      },
    });
  });

  return routes;
}
