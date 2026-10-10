/**
 * Talking to OpenRouter's speech endpoint, and finding out what it cost.
 *
 * `POST /api/v1/audio/speech` is OpenAI-shaped: a model, the text, a voice and
 * a format, and the reply is the audio itself as a byte stream rather than
 * JSON. What it does NOT carry is the price. That comes from
 * `GET /api/v1/generation?id=`, keyed by the `X-Generation-Id` header the
 * speech reply sends, and it can lag the audio by a moment, so it is asked a
 * few times with a pause between, off the audio path.
 *
 * None of this has been checked against live speech traffic from here (no key
 * in the build environment), so every read is defensive: a missing header, a
 * content type in an unexpected shape or a cost lookup that never answers all
 * have a fallback, and CLOUD-VOICES-HANDOVER.md says what to look at first.
 */
import type { SpeechFormat } from 'samwell-shared';

import { PROVIDER_PREFERENCES } from './openrouter.js';

export const SPEECH_URL = 'https://openrouter.ai/api/v1/audio/speech';
const GENERATION_URL = 'https://openrouter.ai/api/v1/generation';

/** How long a maker may take to start answering before the piece is given up. */
const SPEECH_TIMEOUT_MS = 30_000;

export interface SpeechRequest {
  modelId: string;
  voice: string;
  text: string;
  /** Sent only when set, and the caller sets it only for a maker that takes it. */
  speed?: number;
  format: SpeechFormat;
}

export function speechBody(request: SpeechRequest): Record<string, unknown> {
  return {
    model: request.modelId,
    input: request.text,
    voice: request.voice,
    response_format: request.format,
    // Zero retention on speech as on chat: the page being read is sent to the
    // maker and must not be kept. Routing preferences beyond this one are not
    // applied to speech by OpenRouter, so none are sent.
    provider: PROVIDER_PREFERENCES,
    ...(request.speed != null ? { speed: request.speed } : {}),
  };
}

export async function requestSpeech(
  request: SpeechRequest,
  options: { apiKey: string; fetchImpl?: typeof fetch; signal?: AbortSignal },
): Promise<Response> {
  const doFetch = options.fetchImpl ?? fetch;
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), SPEECH_TIMEOUT_MS);
  // Either the reader going away or the maker taking too long ends the call.
  // Hand-joined rather than `AbortSignal.any`, which not every runtime this
  // has to be tested on carries.
  const onAbort = () => timeout.abort();
  options.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    return await doFetch(SPEECH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
        ...(process.env.OPENROUTER_HTTP_REFERER
          ? { 'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER }
          : {}),
        'X-Title': process.env.OPENROUTER_APP_TITLE ?? 'Open Citadel',
      },
      body: JSON.stringify(speechBody(request)),
      signal: timeout.signal,
    });
  } finally {
    // The timer guards the wait for the first byte only. Once the reply has
    // started, the stream is the reader's to cancel.
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

export interface AudioFormat {
  kind: 'pcm' | 'mp3' | 'unknown';
  sampleRate: number;
  channels: number;
}

/** What a maker answering PCM without saying its rate most likely means. */
export const DEFAULT_PCM_RATE = 24_000;

/**
 * Read a speech reply's content type.
 *
 * The PCM type carries its rate and channels as parameters, and the exact
 * spelling is not pinned down across makers (`rate=`, `sample_rate=`,
 * `samplerate=`), so each is accepted. 24 kHz mono is assumed only when
 * nothing is said, and the app is told the rate either way, so a maker that
 * speaks at 22,050 or 44,100 plays at the right pitch.
 */
export function parseAudioFormat(contentType: string | null): AudioFormat {
  const raw = (contentType ?? '').toLowerCase();
  const [type, ...params] = raw.split(';').map((part) => part.trim());
  const read = (names: string[]): number | null => {
    for (const param of params) {
      const [key, value] = param.split('=').map((part) => part?.trim());
      if (key && names.includes(key)) {
        const n = Number(value);
        if (Number.isFinite(n) && n > 0) return Math.floor(n);
      }
    }
    return null;
  };
  const kind = type === 'audio/mpeg' || type === 'audio/mp3'
    ? 'mp3'
    : type === 'audio/pcm' || type === 'audio/l16' || type === 'audio/raw' || type === 'audio/x-raw'
      ? 'pcm'
      : 'unknown';
  return {
    kind,
    sampleRate: read(['rate', 'sample_rate', 'samplerate', 'sample-rate']) ?? DEFAULT_PCM_RATE,
    channels: read(['channels', 'channel', 'ch']) ?? 1,
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * What OpenRouter charged for one generation, in dollars, or null.
 *
 * Asked up to four times, a second, two and four apart: the record is written
 * a moment after the audio finishes and an early ask answers 404. Null means
 * it never came, and the caller falls back to the listed price.
 */
export async function lookupGenerationCost(
  generationId: string,
  options: {
    apiKey: string;
    fetchImpl?: typeof fetch;
    delaysMs?: readonly number[];
    wait?: (ms: number) => Promise<void>;
  },
): Promise<number | null> {
  const doFetch = options.fetchImpl ?? fetch;
  const delays = options.delaysMs ?? [1_000, 2_000, 4_000, 8_000];
  const wait = options.wait ?? sleep;
  for (const delay of delays) {
    await wait(delay);
    try {
      const response = await doFetch(`${GENERATION_URL}?id=${encodeURIComponent(generationId)}`, {
        headers: { Authorization: `Bearer ${options.apiKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) continue;
      const body = (await response.json().catch(() => null)) as
        | { data?: { total_cost?: unknown; usage?: unknown } }
        | null;
      const cost = Number(body?.data?.total_cost ?? body?.data?.usage);
      if (Number.isFinite(cost) && cost >= 0) return cost;
    } catch {
      // Try again after the next pause.
    }
  }
  return null;
}
