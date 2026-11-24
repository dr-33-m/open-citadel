/**
 * `/transcribe`: a podcast episode turned into a transcript, as a background
 * job the phone starts, checks on and collects.
 *
 *   POST   /transcribe                 start one (or hand back the one already running)
 *   GET    /transcribe/pending         this account's unfinished or uncollected jobs
 *   GET    /transcribe/:jobId          where a job is
 *   GET    /transcribe/:jobId/result   the transcript, and the charge settled
 *   DELETE /transcribe/:jobId          the reader's Stop, released uncharged
 *   POST   /transcribe/align           map the copy a phone plays onto a transcript's clock
 *
 * Nothing waits on one long request. The route checks the plan and the
 * limits, reserves the estimate and starts the job; the worker does the rest
 * (`transcribe-worker.ts`). Scribe is handed the episode's URL and fetches it
 * itself; the server only listens to it, for its fingerprint (`audio-align/`).
 *
 * Built from injected parts so the tests can run it against a throwaway
 * database and a fake provider; `transcribe-production.ts` is the wiring.
 */
import { Hono, type Context } from 'hono';
import {
  DAILY_TRANSCRIBE_SECONDS,
  MAX_TRANSCRIBE_SECONDS,
  TRANSCRIPTION_MODEL,
  TranscribeRequestSchema,
  planIncludes,
  transcriptionCredits,
  transcriptionSeconds,
} from 'samwell-shared';
import { z } from 'zod';

import type { TimeMapSegment } from 'samwell-shared';

import { FRAMES_PER_SECOND, fingerprintFromText } from './audio-align/fingerprint.js';
import type { BillingService } from './billing.js';
import { jobView, type TranscribeJobs } from './transcribe-jobs.js';
import { audioFormatFor, isPublicAudioUrl } from './transcribe-upstream.js';
import type { TranscribeWorker } from './transcribe-worker.js';

export interface TranscribeDeps {
  identify(c: Context): Promise<{ id: string }>;
  billing: Pick<BillingService, 'readEntitlement' | 'reserveCredits' | 'releaseReservation'>;
  jobs: TranscribeJobs;
  worker: Pick<TranscribeWorker, 'start' | 'cancel' | 'collect'>;
  recordUsageEvent(args: { id: string; accountId: string; modelId: string; countsTowardLimit: boolean; kind: string }): Promise<void>;
  apiKey(): string | undefined;
  now?: () => number;
  /** Fingerprints the copy at `playingUrl` and maps it onto the transcribed one (`audio-align/`). */
  align?: (playingUrl: string, transcribed: Uint32Array, signal: AbortSignal) => Promise<TimeMapSegment[]>;
}

/** A fingerprint is 4 bytes a frame: six hours of one, in base64, with room. */
const MAX_FINGERPRINT_CHARS = 6 * 3600 * FRAMES_PER_SECOND * 4 * 1.4;
/** Fewer words than a minute of sound place nothing. */
const MIN_FINGERPRINT_WORDS = 60 * FRAMES_PER_SECOND;
/**
 * Copies mapped at once across every account. Each is an episode fetched and
 * decoded, seconds of a CPU and its whole length in bandwidth; past this a
 * phone is told the server is busy and asks again on its next play.
 */
const MAX_ALIGNING = 3;

const AlignSchema = z.object({
  audioUrl: z.string().url().max(4_000),
  fingerprint: z.string().min(1).max(MAX_FINGERPRINT_CHARS),
});

const StartSchema = TranscribeRequestSchema.extend({ mimeType: z.string().max(100).optional() });

const randomId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export function createTranscribeRoutes(deps: TranscribeDeps): Hono {
  const routes = new Hono();
  const now = deps.now ?? (() => Date.now());
  /** Accounts with a copy being mapped: one at a time each, it is minutes of a CPU's work at worst. */
  const aligning = new Set<string>();

  routes.post('/', async (c) => {
    if (!deps.apiKey()) return c.json({ error: 'not_configured' }, 500);
    const { id: accountId } = await deps.identify(c);

    const parsed = StartSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_request', message: parsed.error.message }, 400);
    const { mimeType, ...request } = parsed.data;
    if (!isPublicAudioUrl(request.audioUrl)) return c.json({ error: 'invalid_audio_url' }, 400);
    if (request.durationSec > MAX_TRANSCRIBE_SECONDS) return c.json({ error: 'too_long', maxSeconds: MAX_TRANSCRIBE_SECONDS }, 413);

    const entitlement = await deps.billing.readEntitlement(accountId);
    const plan = entitlement.plan;
    if (!plan || !planIncludes(plan, TRANSCRIPTION_MODEL.minPlan)) {
      return c.json({ error: 'plan_required', plan: TRANSCRIPTION_MODEL.minPlan }, 403);
    }

    // A second tap on the same episode finds the job the first one started;
    // asked afresh, only one still running, never the transcript just made.
    const existing = await deps.jobs.reusableFor(accountId, request.episodeKey, { runningOnly: request.fresh === true });
    if (existing) return c.json({ jobId: existing.id, credits: existing.reservedCredits });

    if (await deps.jobs.activeFor(accountId)) return c.json({ error: 'busy' }, 429);
    const seconds = transcriptionSeconds(request.durationSec);
    if ((await deps.jobs.secondsToday(accountId)) + seconds > DAILY_TRANSCRIBE_SECONDS) {
      return c.json({ error: 'daily_limit' }, 429);
    }

    const credits = Math.max(1, transcriptionCredits(seconds, plan));
    const usageEventId = randomId('transcribe');
    await deps.recordUsageEvent({ id: usageEventId, accountId, modelId: TRANSCRIPTION_MODEL.id, countsTowardLimit: true, kind: 'transcribe' });
    const reserve = await deps.billing.reserveCredits({ accountId, usageEventId, credits });
    if (!reserve.allowed) {
      await deps.billing.releaseReservation({ usageEventId, error: `Refused: ${reserve.reason}` });
      return reserve.reason === 'insufficient_credits'
        ? c.json({ error: 'insufficient_credits', available: reserve.available, required: credits }, 402)
        : c.json({ error: 'plan_required', plan: TRANSCRIPTION_MODEL.minPlan }, 403);
    }

    const jobId = randomId('tj');
    await deps.jobs.insert({
      id: jobId,
      accountId,
      episodeKey: request.episodeKey,
      usageEventId,
      plan,
      request: { ...request, format: audioFormatFor(request.audioUrl, mimeType) },
      durationSec: seconds,
      reservedCredits: credits,
    });
    const job = await deps.jobs.get(jobId);
    if (job) deps.worker.start(job);
    return c.json({ jobId, credits });
  });

  /*
   * The copy this phone plays, onto the transcript's clock. Free: it uses
   * no maker, only this server's time, and the transcript it serves was
   * paid for. The phone keeps the answer, so a copy is mapped once.
   */
  routes.post('/align', async (c) => {
    if (!deps.align) return c.json({ error: 'not_configured' }, 500);
    const { id: accountId } = await deps.identify(c);
    const parsed = AlignSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_request', message: parsed.error.message }, 400);
    if (!isPublicAudioUrl(parsed.data.audioUrl)) return c.json({ error: 'invalid_audio_url' }, 400);
    const transcribed = fingerprintFromText(parsed.data.fingerprint);
    if (transcribed.length < MIN_FINGERPRINT_WORDS) return c.json({ error: 'invalid_fingerprint' }, 400);
    if (aligning.has(accountId) || aligning.size >= MAX_ALIGNING) return c.json({ error: 'busy' }, 429);
    aligning.add(accountId);
    try {
      // A phone that gives up stops the work too.
      const segments = await deps.align(parsed.data.audioUrl, transcribed, c.req.raw.signal);
      return c.json({ segments });
    } catch (error) {
      console.warn(`[Transcribe] align failed for ${accountId}:`, String(error).slice(0, 300));
      return c.json({ error: 'audio_unreachable' }, 502);
    } finally {
      aligning.delete(accountId);
    }
  });

  // Before `/:jobId`, which would otherwise read "pending" as a job id.
  routes.get('/pending', async (c) => {
    const { id: accountId } = await deps.identify(c);
    const jobs = await deps.jobs.pendingFor(accountId);
    return c.json(jobs.map((job) => jobView(job, now())));
  });

  routes.get('/:jobId', async (c) => {
    const { id: accountId } = await deps.identify(c);
    const job = await deps.jobs.find(accountId, c.req.param('jobId'));
    if (!job) return c.json({ error: 'not_found' }, 404);
    return c.json(jobView(job, now()));
  });

  routes.get('/:jobId/result', async (c) => {
    const { id: accountId } = await deps.identify(c);
    const result = await deps.worker.collect(accountId, c.req.param('jobId'));
    if (result.ok) return c.json({ transcript: result.doc, credits: result.credits });
    if (result.reason === 'not_ready') return c.json({ error: 'not_ready' }, 409);
    return c.json({ error: result.reason }, result.reason === 'gone' ? 410 : 404);
  });

  routes.delete('/:jobId', async (c) => {
    const { id: accountId } = await deps.identify(c);
    const job = await deps.jobs.find(accountId, c.req.param('jobId'));
    if (!job) return c.json({ error: 'not_found' }, 404);
    // A transcript already handed over has been paid for; Stop is for a job.
    if (job.chargedCredits != null) return c.json({ error: 'already_collected' }, 409);
    await deps.worker.cancel(job);
    return c.json({ stopped: true });
  });

  return routes;
}
