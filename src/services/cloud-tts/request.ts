/**
 * One piece of a book, read by a cloud voice: the request, streamed.
 *
 * `expo/fetch` rather than the global one, because it hands the body over as
 * it arrives (`response.body.getReader()`), and the first bytes are the first
 * words: playing them while the rest is still being made is the difference
 * between a voice that starts within a second and one that waits for the
 * whole sentence.
 *
 * Every way this can fail is turned into one of a few kinds a reader can be
 * told about, because each has its own drawn state and its own way out
 * (`CloudVoiceFailure`); a raw status code is no use to anybody listening.
 */
import { fetch as streamingFetch } from 'expo/fetch';

import { SAMWELL_CLOUD_BASE_URL } from '@/constants/samwell-cloud';
import { isConnected, reportCloudReached, reportCloudUnreached } from '@/lib/network';
import { cloudJsonHeaders } from '@/services/cloud-identity';

export type CloudVoiceFailure =
  /** The balance cannot cover another piece. */
  | 'out_of_credits'
  /** No plan: it has ended. Every plan is on offer again. */
  | 'plan_lapsed'
  /** A plan that does not reach this voice. Only a bigger one helps. */
  | 'plan_required'
  /** The phone has no connection: `lib/network` says so, not a single failed request. */
  | 'offline'
  /** The server or the maker answered, but not with audio. */
  | 'maker_failed';

export class CloudVoiceError extends Error {
  constructor(
    readonly failure: CloudVoiceFailure,
    message: string,
  ) {
    super(message);
    this.name = 'CloudVoiceError';
  }
}

/** What the app can play: raw PCM it decodes itself, or MP3 the native player decodes. */
export type AudioEncoding = 'pcm' | 'mp3';

export interface PieceFormat {
  /** What actually came back, which an older server decides: it only speaks PCM. */
  kind: AudioEncoding;
  sampleRate: number;
  channels: number;
}

/**
 * How long to wait for the first byte. A sentence that takes longer has failed.
 *
 * Longer than the server's own limit on the maker (`SPEECH_TIMEOUT_MS`, 30s),
 * so a slow maker is reported by the server, with a status, rather than cut
 * off here with none. It was 20s, under the server's, and every Kokoro piece
 * the logs show failing failed at exactly 20s: the maker was slow, the phone
 * hung up, and called it "no connection".
 */
const FIRST_BYTE_TIMEOUT_MS = 35_000;

/**
 * A request that got no answer, or lost it partway: "offline" only when the
 * phone really is (`lib/network`, which asks again rather than trusting one
 * failure). Otherwise it is the voice not answering, which the session tries
 * once more without a word before saying anything.
 */
function noAnswer(): CloudVoiceFailure {
  reportCloudUnreached();
  return isConnected() ? 'maker_failed' : 'offline';
}

function classify(status: number, error: string | undefined): CloudVoiceFailure {
  if (status === 402) return error === 'insufficient_credits' ? 'out_of_credits' : 'plan_lapsed';
  if (status === 403) return 'plan_required';
  return 'maker_failed';
}

/**
 * Ask the server to read one piece, and hand each chunk of raw PCM to
 * `onBytes` as it lands. Resolves when the piece is whole; rejects with a
 * `CloudVoiceError`, or with an abort when `signal` fires.
 */
export async function streamPiece(options: {
  modelId: string;
  voice: string;
  text: string;
  speed?: number;
  /** Asked for, not promised: see `PieceFormat.kind`. */
  format: AudioEncoding;
  signal: AbortSignal;
  onFormat: (format: PieceFormat) => void;
  onBytes: (bytes: Uint8Array) => void;
}): Promise<void> {
  const base = SAMWELL_CLOUD_BASE_URL.trim().replace(/\/+$/, '');
  if (!base) throw new CloudVoiceError('maker_failed', 'Samwell Cloud is not configured for this build.');

  // Before the clock starts: signing in can take its own time, and that is
  // not the voice being slow.
  let headers: Record<string, string>;
  try {
    headers = await cloudJsonHeaders();
  } catch (error) {
    // Not `noAnswer`: signing in is not a request to Samwell Cloud, so it says
    // nothing about reaching it, and must not count towards being offline.
    throw new CloudVoiceError(isConnected() ? 'maker_failed' : 'offline', error instanceof Error ? error.message : 'Could not sign in.');
  }
  // Called off while signing in. The queue checks its own signal, not this.
  if (options.signal.aborted) throw new Error('Aborted before the request went out.');

  // A controller and a timer, as everywhere in this app: Hermes has neither
  // `AbortSignal.timeout` nor `AbortSignal.any`.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, FIRST_BYTE_TIMEOUT_MS);
  const cancel = () => controller.abort();
  options.signal.addEventListener('abort', cancel, { once: true });

  try {
    let response: Awaited<ReturnType<typeof streamingFetch>>;
    try {
      response = await streamingFetch(`${base}/tts/speak`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          modelId: options.modelId,
          voice: options.voice,
          text: options.text,
          ...(options.speed != null ? { speed: options.speed } : {}),
          ...(options.format === 'mp3' ? { format: 'mp3' } : {}),
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (options.signal.aborted) throw error;
      // Past the timeout the server was reached and the maker was slow.
      if (timedOut) throw new CloudVoiceError('maker_failed', 'The voice took too long to start.');
      throw new CloudVoiceError(noAnswer(), error instanceof Error ? error.message : 'No connection.');
    }
    reportCloudReached();

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new CloudVoiceError(classify(response.status, body?.error), `Answered ${response.status}.`);
    }
    // PCM is always playable; MP3 only when it was asked for, which is only
    // when the native player can decode it. Anything else is the maker
    // failing rather than the reader.
    const kind = response.headers.get('x-audio-format');
    const playable = kind === 'pcm' || (kind === 'mp3' && options.format === 'mp3');
    if (!playable || !response.body) {
      throw new CloudVoiceError('maker_failed', 'The voice answered in a format this app cannot play.');
    }
    options.onFormat({
      kind,
      sampleRate: Number(response.headers.get('x-audio-sample-rate')) || 24_000,
      channels: Number(response.headers.get('x-audio-channels')) || 1,
    });

    const reader = response.body.getReader();
    let first = true;
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (error) {
        if (options.signal.aborted) throw error;
        if (timedOut) throw new CloudVoiceError('maker_failed', 'The voice took too long to start.');
        throw new CloudVoiceError(noAnswer(), 'The connection dropped mid-sentence.');
      }
      if (first) {
        clearTimeout(timer);
        first = false;
      }
      if (chunk.done) return;
      if (chunk.value.byteLength > 0) options.onBytes(chunk.value);
    }
  } finally {
    clearTimeout(timer);
    options.signal.removeEventListener('abort', cancel);
  }
}

/**
 * Where a voice's free sample lives. Playing it never touches a balance.
 * No extension: the clip is MP3 or WAV by maker, and the content type says
 * which, so the player is never told one thing by the URL and another by
 * the reply.
 */
export function sampleUrl(modelId: string, voice: string): string | null {
  const base = SAMWELL_CLOUD_BASE_URL.trim().replace(/\/+$/, '');
  return base ? `${base}/tts/samples/${modelId}/${encodeURIComponent(voice)}` : null;
}
