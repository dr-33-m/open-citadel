/**
 * Podcast transcripts: the one model that makes them, what one costs, and
 * the shape a transcript takes on its way to the phone.
 *
 * Shared for the reason `billing.ts` and `voices.ts` are. The app draws
 * "413 Neurons" before the reader taps and the server reserves and charges
 * against the same figure; two copies of the arithmetic would drift, and the
 * first sign would be a reader shown one number and charged another.
 *
 * Pure and dependency-free apart from zod, so it can be tested on its own.
 */
import { z } from 'zod';

import { CREDIT_PLANS, creditValueUsd, type PlanId } from './billing';

export interface TranscriptionModel {
  /** OpenRouter's model id, which is also what the transcription endpoint is sent. */
  id: string;
  label: string;
  maker: string;
  /**
   * What OpenRouter charges per second of audio, in dollars.
   *
   * Read from the live endpoint on 2026-10-19: $61.11 per million seconds
   * with no discount, confirmed by a real 913 second episode that cost
   * $0.0558. The spec's first draft had half that, from a 0.5 discount the
   * endpoint no longer shows. The charge is OpenRouter's own figure for the
   * request; this is the estimate drawn before it and the fallback after.
   */
  pricePerSecondUsd: number;
  minPlan: PlanId;
}

/** ElevenLabs Scribe v2: speakers, word times, 90+ languages. One model for every plan. */
export const TRANSCRIPTION_MODEL: TranscriptionModel = {
  id: 'elevenlabs/scribe-v2',
  label: 'Scribe v2',
  maker: 'ElevenLabs',
  pricePerSecondUsd: 61.111_111_111_1 / 1_000_000,
  minPlan: 'maester',
};

/** Episodes longer than this are refused in v1. */
export const MAX_TRANSCRIBE_SECONDS = 4 * 3_600;

/**
 * What a job reserves for an episode whose feed gives no length. Settled on
 * the length Scribe reports, so it only decides whether a reader can start.
 */
export const UNKNOWN_DURATION_SECONDS = 2 * 3_600;

/** Hours of audio one account may send in a day. The balance is the real stop. */
export const DAILY_TRANSCRIBE_SECONDS = 10 * 3_600;

/** The seconds a job is priced on: the feed's length, or two hours when it has none. */
export function transcriptionSeconds(durationSec: number): number {
  return Number.isFinite(durationSec) && durationSec > 0 ? durationSec : UNKNOWN_DURATION_SECONDS;
}

/** What transcribing this many seconds costs, in dollars. */
export function transcriptionCostUsd(
  seconds: number,
  model: Pick<TranscriptionModel, 'pricePerSecondUsd'> = TRANSCRIPTION_MODEL,
): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return seconds * model.pricePerSecondUsd;
}

/**
 * Neurons for transcribing an episode of this length: seconds times the
 * price, over the credit value, rounded up once. Zero seconds is zero; the
 * app draws it, the server reserves it.
 */
export function transcriptionCredits(
  durationSec: number,
  plan: PlanId = 'maester',
  model: Pick<TranscriptionModel, 'pricePerSecondUsd'> = TRANSCRIPTION_MODEL,
): number {
  return usdToCreditsUp(transcriptionCostUsd(durationSec, model), plan);
}

/** Dollars to Neurons, rounded up, with no one-credit floor (zero costs nothing). */
export function usdToCreditsUp(costUsd: number, plan: PlanId = 'maester'): number {
  const value = creditValueUsd(CREDIT_PLANS[plan]);
  if (!(costUsd > 0) || !(value > 0)) return 0;
  // A hair under to absorb float noise: 412.5000001 must not become 414.
  return Math.ceil(costUsd / value - 1e-9);
}

// -- The transcript ----------------------------------------------------------

export const TranscriptSegmentSchema = z.object({
  start: z.number().min(0),
  end: z.number().min(0),
  /** An index into `speakers`, or null when the source names nobody. */
  speaker: z.number().int().min(0).nullable(),
  text: z.string(),
});

export const TranscriptDocSchema = z.object({
  version: z.literal(1),
  source: z.enum(['scribe', 'feed']),
  language: z.string().nullable(),
  durationSec: z.number().min(0),
  /**
   * Display names, one per speaker the transcript knows. A segment points at
   * one by index, so renaming a speaker is one write for every line they have.
   */
  speakers: z.array(z.string()),
  segments: z.array(TranscriptSegmentSchema),
});

export type TranscriptSegment = z.infer<typeof TranscriptSegmentSchema>;
export type TranscriptDoc = z.infer<typeof TranscriptDocSchema>;

/** What a speaker is called when nobody has said: "Speaker 3". */
export function defaultSpeakerName(index: number): string {
  return `Speaker ${index + 1}`;
}

// -- The job, as the app sees it ---------------------------------------------

export type TranscribeJobStatus = 'queued' | 'transcribing' | 'ready' | 'failed';

/**
 * Why a job failed, in the words the app picks its toast by. `audio_unreachable`
 * is the provider saying it could not fetch the episode; everything else that
 * went wrong upstream is `provider_failed`.
 */
export type TranscribeFailure = 'audio_unreachable' | 'provider_failed' | 'expired';

export interface TranscribeJobView {
  jobId: string;
  episodeKey: string;
  status: TranscribeJobStatus;
  /** 0 to 1. An estimate while Scribe works: it reports nothing until it is done. */
  progress: number;
  error?: TranscribeFailure;
}

export const TranscribeRequestSchema = z.object({
  audioUrl: z.string().min(1).max(2_048),
  durationSec: z.number().min(0),
  /** The episode's guid, or its audio URL when it has none. */
  episodeKey: z.string().min(1).max(2_048),
  title: z.string().max(500),
  showTitle: z.string().max(500),
  /** Show notes as plain text, for speaker names and Scribe's key terms. */
  notes: z.string().max(20_000).optional(),
});

export type TranscribeRequest = z.infer<typeof TranscribeRequestSchema>;
