/**
 * Samwell Cloud's `/transcribe` routes, from the phone.
 *
 * The phone starts a job, checks on it, collects the transcript (which is
 * when the reader is charged) and can stop it. Every way a start can be
 * refused is turned into one of a few kinds, because each has its own toast
 * or its own sheet; a status code is no use to anybody listening.
 */
import { TranscriptDocSchema, type TranscribeJobView, type TranscribeRequest, type TranscriptDoc } from 'samwell-shared';

import { SAMWELL_CLOUD_BASE_URL } from '@/constants/samwell-cloud';
import { NotSignedIn, cloudHeaders, cloudJsonHeaders } from '@/services/cloud-identity';

export type TranscribeRefusal =
  | 'offline'
  | 'plan_required'
  | 'insufficient_credits'
  | 'too_long'
  | 'busy'
  | 'daily_limit'
  | 'failed';

export class TranscribeError extends Error {
  constructor(
    readonly refusal: TranscribeRefusal,
    readonly detail: { available?: number; required?: number } = {},
  ) {
    super(`Transcription refused: ${refusal}`);
    this.name = 'TranscribeError';
  }
}

const REQUEST_TIMEOUT_MS = 20_000;

/** Signed out, or a guest with nothing bought: the plans sheet, not an error. */
async function headers(json = false): Promise<Record<string, string>> {
  try {
    return await (json ? cloudJsonHeaders() : cloudHeaders());
  } catch (error) {
    if (error instanceof NotSignedIn) throw new TranscribeError('plan_required');
    throw new TranscribeError('failed');
  }
}

/** One call, with a timeout Hermes can do (no `AbortSignal.timeout` there). Offline becomes a refusal. */
async function call(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<Response> {
  if (!SAMWELL_CLOUD_BASE_URL) throw new TranscribeError('failed');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    return await fetch(`${SAMWELL_CLOUD_BASE_URL}/transcribe${path}`, { ...init, signal: controller.signal });
  } catch {
    if (signal?.aborted) throw new Error('Cancelled.');
    throw new TranscribeError('offline');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

export async function startTranscription(
  request: TranscribeRequest & { mimeType?: string | null },
): Promise<{ jobId: string; credits: number }> {
  const response = await call('', {
    method: 'POST',
    headers: await headers(true),
    body: JSON.stringify({ ...request, mimeType: request.mimeType ?? undefined }),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (response.ok && typeof body.jobId === 'string') return { jobId: body.jobId, credits: Number(body.credits ?? 0) };
  const error = String(body.error ?? '');
  if (response.status === 403 || response.status === 401) throw new TranscribeError('plan_required');
  if (response.status === 402) {
    throw new TranscribeError('insufficient_credits', { available: Number(body.available), required: Number(body.required) });
  }
  if (response.status === 413) throw new TranscribeError('too_long');
  if (error === 'busy') throw new TranscribeError('busy');
  if (error === 'daily_limit') throw new TranscribeError('daily_limit');
  console.warn('[Transcribe] start refused', response.status, error);
  throw new TranscribeError('failed');
}

/** Where a job is. Null when the server no longer knows it (stopped, or long gone). */
export async function transcribeJobStatus(jobId: string, signal?: AbortSignal): Promise<TranscribeJobView | null> {
  const response = await call(`/${encodeURIComponent(jobId)}`, { headers: await headers() }, signal);
  if (response.status === 404) return null;
  if (!response.ok) throw new TranscribeError('failed');
  return (await response.json()) as TranscribeJobView;
}

/** The transcript, and what it cost. The charge is settled by this call, once. */
export async function collectTranscript(jobId: string): Promise<{ doc: TranscriptDoc; credits: number }> {
  const response = await call(`/${encodeURIComponent(jobId)}/result`, { headers: await headers() });
  if (!response.ok) throw new TranscribeError('failed');
  const body = (await response.json()) as { transcript?: unknown; credits?: unknown };
  const parsed = TranscriptDocSchema.safeParse(body.transcript);
  if (!parsed.success) throw new TranscribeError('failed');
  return { doc: parsed.data, credits: Number(body.credits ?? 0) };
}

/** The reader's Stop: the server releases the hold, and nothing is charged. */
export async function stopTranscription(jobId: string): Promise<void> {
  await call(`/${encodeURIComponent(jobId)}`, { method: 'DELETE', headers: await headers() });
}

/** This account's unfinished or uncollected jobs, for a phone that was closed mid-job. */
export async function pendingTranscriptions(): Promise<TranscribeJobView[]> {
  const response = await call('/pending', { headers: await headers() });
  if (!response.ok) throw new TranscribeError('failed');
  return (await response.json()) as TranscribeJobView[];
}
