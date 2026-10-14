/**
 * Handing one sentence's audio to Readium's native player as it arrives.
 *
 * PCM is decoded here and gathered into chunks of about a fifth of a second,
 * so the bridge is crossed a few times a second rather than once per network
 * packet. MP3 goes over as it lands, since it is small and the native side
 * decodes it as it comes. Either way the sentence is ended exactly once,
 * with `isLast`, even when nothing at all arrived: the native engine waits
 * for that and would otherwise hold the book on this sentence for ever.
 */
import { floatBytes } from '@/services/cloud-tts/pcm';
import type { PieceFormat } from '@/services/cloud-tts/request';

export const MP3_MIME = 'audio/mpeg';

/** About a fifth of a second: fewer bridge calls, and still no wait worth hearing. */
const MIN_CHUNK_SECONDS = 0.2;
/** What an empty answer is said to be, when nothing came to read a rate from. */
const SILENT_RATE = 24_000;

export interface PlayerHooks {
  provide(requestId: string, samples: ArrayBuffer, sampleRate: number, isLast: boolean): void;
  provideEncoded(requestId: string, data: ArrayBuffer, mimeType: string, isLast: boolean): void;
}

export interface Forwarder {
  pcm(samples: Float32Array): void;
  mp3(bytes: Uint8Array): void;
  /** Ends the sentence: whatever is gathered, then `isLast`. */
  end(): void;
  /** Whether any audio has gone to the player yet. */
  readonly started: boolean;
}

function exactBytes(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function createForwarder(
  requestId: string,
  hooks: PlayerHooks,
  format: () => PieceFormat | null,
  onFirstAudio: () => void,
): Forwarder {
  let started = false;
  let pending: Float32Array[] = [];
  let pendingLength = 0;

  const markStarted = () => {
    if (started) return;
    started = true;
    onFirstAudio();
  };

  const flushPcm = (isLast: boolean) => {
    const rate = format()?.sampleRate ?? SILENT_RATE;
    const joined = new Float32Array(pendingLength);
    let offset = 0;
    for (const part of pending) {
      joined.set(part, offset);
      offset += part.length;
    }
    pending = [];
    pendingLength = 0;
    if (joined.length > 0) markStarted();
    if (joined.length > 0 || isLast) hooks.provide(requestId, floatBytes(joined), rate, isLast);
  };

  return {
    pcm(samples) {
      pending.push(samples);
      pendingLength += samples.length;
      const rate = format()?.sampleRate;
      if (rate && pendingLength >= rate * MIN_CHUNK_SECONDS) flushPcm(false);
    },
    mp3(bytes) {
      if (bytes.byteLength === 0) return;
      markStarted();
      hooks.provideEncoded(requestId, exactBytes(bytes), MP3_MIME, false);
    },
    end() {
      if (format()?.kind === 'mp3') hooks.provideEncoded(requestId, new ArrayBuffer(0), MP3_MIME, true);
      else flushPcm(true);
    },
    get started() {
      return started;
    },
  };
}
