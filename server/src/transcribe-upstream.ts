/**
 * Talking to OpenRouter's transcription endpoint: the episode's URL in, the
 * words, speakers and cost out.
 *
 * `POST /api/v1/audio/transcriptions` with `input_audio.url`: the provider
 * downloads the episode itself, so the server never fetches, holds or cuts
 * audio, and one request carries the whole episode with one set of speaker
 * labels. Unlike speech, the reply is JSON and carries its own cost
 * (`usage.cost`), so no generation lookup is needed.
 *
 * Zero retention is asked for as on every other call. On 2026-10-19 Scribe
 * v2's one endpoint (ElevenLabs) was on OpenRouter's ZDR list, so the flag
 * costs nothing; if that ever changes, the owner's call is to send it to the
 * endpoint that is available (`TRANSCRIBE_ALLOW_RETENTION=1`), because the
 * audio is a public episode, not the reader's own words.
 */
import { TRANSCRIPTION_MODEL } from 'samwell-shared';

import { PROVIDER_PREFERENCES } from './openrouter.js';
import type { ScribeReply } from './transcript-shape.js';

export const TRANSCRIPTION_URL = 'https://openrouter.ai/api/v1/audio/transcriptions';

/**
 * How long one episode may take. Not measured for a two hour episode yet: the
 * spike could not reach a full-length file (see the spec). Generous, since a
 * job is a background task and nothing waits on it but a progress ring.
 */
export const TRANSCRIBE_TIMEOUT_MS = 20 * 60_000;

const MAX_KEYTERMS = 50;

// -- What may be sent --------------------------------------------------------

const PRIVATE_V4 = [
  /^0\./, /^10\./, /^127\./, /^169\.254\./, /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

/**
 * Whether a URL is fit to hand to the provider: http or https, a public host,
 * at most 2,048 characters. The server only passes it on, so this is the
 * whole check: nothing here ever fetches it.
 */
export function isPublicAudioUrl(raw: string): boolean {
  if (raw.length > 2_048) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return false;
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return !PRIVATE_V4.some((range) => range.test(host));
  if (host.includes(':')) {
    // IPv6: loopback, unspecified, link-local, unique-local and v4-mapped are all out.
    return !(host === '::1' || host === '::' || /^fe[89ab]/.test(host) || /^f[cd]/.test(host) || host.startsWith('::ffff:'));
  }
  // A bare name with no dot is somebody's intranet.
  return host.includes('.');
}

const FORMATS = ['mp3', 'm4a', 'aac', 'ogg', 'wav', 'flac', 'webm'] as const;
const MIME_FORMATS: Record<string, (typeof FORMATS)[number]> = {
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a',
  'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/flac': 'flac',
  'audio/webm': 'webm',
};

/**
 * The container, which the endpoint needs when the path has no extension (as
 * a tracking redirect's often has not): the path's own extension, else the
 * feed's MIME type, else MP3, which is what nearly every podcast is.
 */
export function audioFormatFor(raw: string, mimeType?: string | null): string {
  try {
    const ext = new URL(raw).pathname.split('.').pop()?.toLowerCase() ?? '';
    if ((FORMATS as readonly string[]).includes(ext)) return ext;
  } catch {
    // Fall through to the MIME type.
  }
  return MIME_FORMATS[(mimeType ?? '').toLowerCase().split(';')[0].trim()] ?? 'mp3';
}

/**
 * Names and terms from the show notes, to bias Scribe's spelling: runs of two
 * to four capitalised words ("Lex Fridman", "Federal Reserve Bank"), the
 * likeliest to be misheard. Capped, since each may cost a little extra.
 */
export function keytermsFrom(...texts: (string | null | undefined)[]): string[] {
  const found = new Set<string>();
  const run = /\b[A-Z][\p{L}'’.-]+(?:\s+(?:[A-Z][\p{L}'’.-]+|de|van|von|da|al|bin))*\s+[A-Z][\p{L}'’-]+\b/gu;
  for (const text of texts) {
    for (const match of (text ?? '').matchAll(run)) {
      const term = match[0].replace(/[.’']+$/, '').trim();
      const words = term.split(/\s+/).length;
      if (words < 2 || words > 4 || term.length > 100) continue;
      found.add(term);
      if (found.size >= MAX_KEYTERMS) return [...found];
    }
  }
  return [...found];
}

// -- The call ----------------------------------------------------------------

export function transcriptionBody(args: { audioUrl: string; format: string; keyterms: string[] }): Record<string, unknown> {
  return {
    model: TRANSCRIPTION_MODEL.id,
    input_audio: { url: args.audioUrl, format: args.format },
    response_format: 'verbose_json',
    timestamp_granularities: ['word', 'segment'],
    diarize: true,
    ...(args.keyterms.length > 0 ? { keyterms: args.keyterms } : {}),
    provider: process.env.TRANSCRIBE_ALLOW_RETENTION === '1' ? {} : PROVIDER_PREFERENCES,
  };
}

export type TranscribeOutcome =
  | { ok: true; reply: ScribeReply }
  | { ok: false; reason: 'audio_unreachable' | 'provider_failed' | 'cancelled'; detail: string };

/** One episode to Scribe. Never throws: every failure is an outcome the job can record. */
export async function requestTranscription(
  args: { audioUrl: string; format: string; keyterms: string[] },
  options: { apiKey: string; fetchImpl?: typeof fetch; signal?: AbortSignal; timeoutMs?: number },
): Promise<TranscribeOutcome> {
  const doFetch = options.fetchImpl ?? fetch;
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), options.timeoutMs ?? TRANSCRIBE_TIMEOUT_MS);
  const onAbort = () => timeout.abort();
  options.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const response = await doFetch(TRANSCRIPTION_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
        ...(process.env.OPENROUTER_HTTP_REFERER ? { 'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER } : {}),
        'X-Title': process.env.OPENROUTER_APP_TITLE ?? 'Open Citadel',
      },
      body: JSON.stringify(transcriptionBody(args)),
      signal: timeout.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      // The provider could not download the episode: its fault, not ours, and
      // worth telling the reader apart from a provider having a bad hour.
      const unreachable = [400, 404, 415, 422].includes(response.status) && /download|fetch|url|reach|access|media|audio file/i.test(text);
      return { ok: false, reason: unreachable ? 'audio_unreachable' : 'provider_failed', detail: `${response.status}: ${text.slice(0, 300)}` };
    }
    const reply = JSON.parse(text) as ScribeReply;
    return { ok: true, reply };
  } catch (error) {
    if (options.signal?.aborted) return { ok: false, reason: 'cancelled', detail: 'Stopped' };
    return { ok: false, reason: 'provider_failed', detail: String(error) };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}
