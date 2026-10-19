/**
 * Running a transcription job, and charging for it when the phone collects it.
 *
 * Charged like a chat turn, not like read-aloud: one episode is one job, so
 * one reservation (taken by the route before the job exists) and one settle.
 * The settle happens on collection, not when Scribe finishes, because a
 * reader is only charged for a transcript that reached their phone. Every
 * failure on the way, and a transcript nobody collects inside a day,
 * releases the hold uncharged; anything already paid upstream is the
 * house's loss, a few cents at most, the rule `tts-billing.ts` follows.
 *
 * The charge is OpenRouter's own `usage.cost` for the request (the listed
 * price times the seconds Scribe heard when it is missing), plus what
 * Samwell's speaker naming cost, turned into Neurons once and rounded up once.
 */
import { TRANSCRIPTION_MODEL, transcriptionCostUsd, usdToCreditsUp, type PlanId, type TranscriptDoc } from 'samwell-shared';

import type { BillingService } from './billing.js';
import type { JobRow, TranscribeJobs } from './transcribe-jobs.js';
import { keytermsFrom, requestTranscription } from './transcribe-upstream.js';
import { shapeScribeReply } from './transcript-shape.js';

export interface NameSpeakers {
  (doc: TranscriptDoc, context: { accountId: string; title: string; showTitle: string; notes?: string }): Promise<{
    doc: TranscriptDoc;
    costUsd: number;
  }>;
}

export interface TranscribeWorkerDeps {
  jobs: TranscribeJobs;
  billing: Pick<BillingService, 'settleCredits' | 'releaseReservation'>;
  apiKey(): string | undefined;
  nameSpeakers: NameSpeakers;
  fetchImpl?: typeof fetch;
}

export type CollectResult =
  | { ok: true; doc: TranscriptDoc; credits: number }
  | { ok: false; reason: 'not_found' | 'not_ready' | 'gone' };

export function createTranscribeWorker(deps: TranscribeWorkerDeps) {
  const running = new Map<string, { controller: AbortController; done: Promise<void> }>();

  async function fail(job: JobRow, error: string, detail: string): Promise<void> {
    await deps.jobs.markFailed(job.id, 'failed', error);
    await deps.billing.releaseReservation({ usageEventId: job.usageEventId, error: `Transcription failed: ${detail}` });
    console.warn(`[Transcribe] ${job.id} failed (${error}): ${detail.slice(0, 300)}`);
  }

  async function run(job: JobRow, signal: AbortSignal): Promise<void> {
    const apiKey = deps.apiKey();
    if (!apiKey) return fail(job, 'provider_failed', 'OPENROUTER_API_KEY is not configured');
    if (!(await deps.jobs.advance(job.id, 'transcribing'))) return;

    const { request } = job;
    const outcome = await requestTranscription(
      { audioUrl: request.audioUrl, format: request.format, keyterms: keytermsFrom(request.title, request.showTitle, request.notes) },
      { apiKey, fetchImpl: deps.fetchImpl, signal },
    );
    if (signal.aborted) return;
    if (!outcome.ok) return fail(job, outcome.reason === 'audio_unreachable' ? 'audio_unreachable' : 'provider_failed', outcome.detail);

    const shaped = shapeScribeReply(outcome.reply, request.durationSec);
    if (shaped.doc.segments.length === 0) return fail(job, 'provider_failed', 'Scribe heard no words');
    const audioSeconds = outcome.reply.usage?.seconds ?? shaped.doc.durationSec;
    const reported = outcome.reply.usage?.cost;
    const scribeCost = typeof reported === 'number' && reported > 0 ? reported : transcriptionCostUsd(audioSeconds);

    if (!(await deps.jobs.advance(job.id, 'naming'))) return;
    let doc = shaped.doc;
    let namingCost = 0;
    if (doc.speakers.length > 0) {
      try {
        const named = await deps.nameSpeakers(doc, { accountId: job.accountId, title: request.title, showTitle: request.showTitle, notes: request.notes });
        doc = named.doc;
        namingCost = named.costUsd;
      } catch (error) {
        console.warn(`[Transcribe] ${job.id} speaker naming failed, default names kept:`, error);
      }
    }
    if (signal.aborted) return;

    const costUsd = scribeCost + namingCost;
    await deps.jobs.markReady(job.id, { resultJson: JSON.stringify(doc), costUsd, audioSeconds });
    // What was charged upstream and from which figure; never the words.
    console.log(
      `[Transcribe] ${job.id} ${Math.round(audioSeconds)} s, ${doc.segments.length} segments, ` +
        `${doc.speakers.length} speakers: $${scribeCost.toFixed(5)} (${reported ? 'OpenRouter' : 'listed'}) + ` +
        `$${namingCost.toFixed(5)} names = ${usdToCreditsUp(costUsd, job.plan as PlanId)} Neurons on collection ` +
        `(reserved ${job.reservedCredits})`,
    );
  }

  function start(job: JobRow): void {
    if (running.has(job.id)) return;
    const controller = new AbortController();
    const done = run(job, controller.signal)
      .catch(async (error) => {
        await fail(job, 'provider_failed', String(error)).catch(() => undefined);
      })
      .finally(() => running.delete(job.id));
    running.set(job.id, { controller, done });
  }

  return {
    start,

    /** Waits for a job's run to end; for tests, which production never does. */
    async settled(jobId: string): Promise<void> {
      await running.get(jobId)?.done;
    },

    /** The reader's Stop: the job ends, anything held goes, and nothing is charged. */
    async cancel(job: JobRow): Promise<void> {
      running.get(job.id)?.controller.abort();
      await deps.jobs.remove(job.id);
      await deps.billing.releaseReservation({ usageEventId: job.usageEventId, error: 'Stopped by the reader' });
    },

    /** Picks up what a restart interrupted. Scribe is asked again; the reader still pays once. */
    async resume(): Promise<number> {
      const unfinished = await deps.jobs.unfinished();
      for (const job of unfinished) start(job);
      return unfinished.length;
    },

    async collect(accountId: string, jobId: string): Promise<CollectResult> {
      const job = await deps.jobs.find(accountId, jobId);
      if (!job) return { ok: false, reason: 'not_found' };
      if (job.status !== 'ready') return { ok: false, reason: job.status === 'failed' || job.status === 'expired' ? 'gone' : 'not_ready' };
      if (!job.resultJson) return { ok: false, reason: 'gone' };
      const doc = JSON.parse(job.resultJson) as TranscriptDoc;

      if (job.chargedCredits != null) return { ok: true, doc, credits: job.chargedCredits };
      const credits = Math.max(1, usdToCreditsUp(job.costUsd ?? 0, job.plan as PlanId));
      if (!(await deps.jobs.claimCharge(job.id, credits))) {
        // A second collect got here first; it charged, this one hands over.
        const again = await deps.jobs.get(job.id);
        return { ok: true, doc, credits: again?.chargedCredits ?? credits };
      }
      const settle = await deps.billing.settleCredits({
        usageEventId: job.usageEventId,
        actualCredits: credits,
        usage: { costUsd: job.costUsd },
        description: `Podcast transcript, ${TRANSCRIPTION_MODEL.label}`,
      });
      if (!settle.settled) console.warn(`[Transcribe] ${job.id} collected but its event was already closed; not charged`);
      return { ok: true, doc, credits: settle.settled ? credits : 0 };
    },

    /** Releases transcripts nobody collected in a day and prunes the rest. */
    async sweep(): Promise<void> {
      for (const job of await deps.jobs.uncollected()) {
        await deps.jobs.markFailed(job.id, 'expired', 'Not collected in 24 hours');
        await deps.billing.releaseReservation({ usageEventId: job.usageEventId, error: 'Transcript not collected in 24 hours' });
      }
      await deps.jobs.prune();
    },
  };
}

export type TranscribeWorker = ReturnType<typeof createTranscribeWorker>;
