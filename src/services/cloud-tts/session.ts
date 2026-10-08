/**
 * The cloud voice's side of Readium's synthesis bridge, for one book.
 *
 * Readium's native engine asks JS for each sentence (`onTTSSynthesisRequest`)
 * and plays whatever mono Float32 comes back (`ttsProvideAudioChunk`), any
 * rate, any number of chunks. On-device voices answer it by synthesizing on
 * the phone; this answers it from the cloud, and Readium never knows the
 * difference: highlighting, pause, skip, page turns and the lock screen stay
 * exactly where they were. No native change, so it ships over the air.
 *
 * A sentence is answered from, in order: the phone's cache, a fetch already
 * running for it (a guess from `Lookahead`), or a fresh fetch. Audio is handed
 * on as it arrives so the first words play while the rest is being made. At
 * most two fetches run at once, the server's own limit, with the sentence
 * being waited for always first in line.
 *
 * A failure is never answered with `ttsSynthesisFailed`: on Android that
 * quietly restarts the book on the phone's own voice. The request is held
 * open instead and the failure handed to `onFailure`, so the reader can be
 * shown what happened and choose (`use-cloud-voice-failure.ts`).
 */
import { readCachedPiece } from '@/services/cloud-tts/audio-cache';
import { pieceCacheKey } from '@/services/cloud-tts/cache-key';
import { Lookahead } from '@/services/cloud-tts/lookahead';
import { floatBytes } from '@/services/cloud-tts/pcm';
import { PieceQueue, type CloudVoiceChoice, type JobEvent } from '@/services/cloud-tts/piece-queue';
import type { CloudVoiceFailure } from '@/services/cloud-tts/request';

export type { CloudVoiceChoice } from '@/services/cloud-tts/piece-queue';

export interface CloudSessionHooks {
  provide(requestId: string, samples: ArrayBuffer, sampleRate: number, isLast: boolean): void;
  onFailure(requestId: string, failure: CloudVoiceFailure): void;
  /** True from a sentence being asked for until its first audio is handed on. */
  onWaiting(waiting: boolean): void;
}

/** About a fifth of a second: fewer bridge calls, and still no wait worth hearing. */
const MIN_CHUNK_SECONDS = 0.2;
/** What an empty answer is said to be, when a maker sends nothing to read a rate from. */
const SILENT_RATE = 24_000;

export class CloudVoiceSession {
  private readonly queue = new PieceQueue();
  private readonly lookahead = new Lookahead();
  /** The request being answered now, and how to stop answering it. */
  private answering: { requestId: string; detach: () => void } | null = null;
  /** Requests held open after a failure, kept so they can be tried again. */
  private readonly held = new Map<string, { text: string; choice: CloudVoiceChoice }>();
  private disposed = false;

  constructor(
    private readonly bookId: string,
    private readonly hooks: CloudSessionHooks,
  ) {}

  /** Readium asked for a sentence. */
  request(requestId: string, text: string, choice: CloudVoiceChoice): void {
    this.lookahead.recordRequest(text);
    void this.answer(requestId, text, choice, { retried: false });
  }

  /** Readium moved to a sentence; fetch the next one or two ahead. */
  utterance(after: string | null | undefined, choice: CloudVoiceChoice): void {
    for (const text of this.lookahead.predict(after)) {
      const key = this.keyFor(text, choice);
      if (!this.queue.get(key)) void this.prefetch(key, text, choice);
    }
  }

  /** Readium no longer needs this sentence (skipped, or stopped). The fetch carries on into the cache. */
  cancel(requestId: string): void {
    this.held.delete(requestId);
    if (this.answering?.requestId === requestId) {
      this.answering.detach();
      this.answering = null;
      this.hooks.onWaiting(false);
    }
  }

  /** Try a held sentence again, after "Try again" or a plan bought. */
  retry(requestId: string, choice?: CloudVoiceChoice): void {
    const held = this.held.get(requestId);
    if (!held) return;
    this.held.delete(requestId);
    const next = choice ?? held.choice;
    this.queue.drop(this.keyFor(held.text, next));
    void this.answer(requestId, held.text, next, { retried: true });
  }

  dispose(): void {
    this.disposed = true;
    this.answering?.detach();
    this.answering = null;
    this.queue.dispose();
    this.held.clear();
  }

  private keyFor(text: string, choice: CloudVoiceChoice): string {
    return pieceCacheKey({ bookId: this.bookId, modelId: choice.modelId, voice: choice.voice, speed: choice.speed, text });
  }

  private async prefetch(key: string, text: string, choice: CloudVoiceChoice): Promise<void> {
    // Reserve the slot in the map before the cache read, so a guess made twice
    // in quick succession is fetched once.
    const job = this.queue.create(key, text, choice);
    if (await readCachedPiece(key)) {
      if (this.queue.get(key) === job && job.state === 'queued') this.queue.drop(key);
      return;
    }
    this.queue.enqueue(job, false);
  }

  private async answer(requestId: string, text: string, choice: CloudVoiceChoice, options: { retried: boolean }): Promise<void> {
    this.answering?.detach();
    const key = this.keyFor(text, choice);
    const cached = this.queue.get(key) ? null : await readCachedPiece(key);
    if (this.disposed) return;
    if (cached) {
      this.answering = null;
      this.hooks.onWaiting(false);
      this.hooks.provide(requestId, floatBytes(cached.samples), cached.sampleRate, true);
      return;
    }

    let found = this.queue.get(key);
    if (!found || found.state === 'failed') {
      if (found) this.queue.drop(key);
      found = this.queue.create(key, text, choice);
    }
    const job = found;
    if (job.state === 'queued') this.queue.enqueue(job, true);

    this.hooks.onWaiting(true);
    let sentAny = false;
    let pending: Float32Array[] = [];
    let pendingLength = 0;
    const flush = (isLast: boolean) => {
      if (!job.format) {
        // Nothing came at all: still answered, so the native engine is not
        // left waiting on a sentence for ever.
        if (isLast) this.hooks.provide(requestId, new ArrayBuffer(0), SILENT_RATE, true);
        return;
      }
      const joined = new Float32Array(pendingLength);
      let offset = 0;
      for (const part of pending) {
        joined.set(part, offset);
        offset += part.length;
      }
      pending = [];
      pendingLength = 0;
      if (joined.length > 0 && !sentAny) this.hooks.onWaiting(false);
      if (joined.length > 0) sentAny = true;
      this.hooks.provide(requestId, floatBytes(joined), job.format.sampleRate, isLast);
    };

    const listener = (event: JobEvent) => {
      if (event.type === 'audio') {
        pending.push(event.samples);
        pendingLength += event.samples.length;
        if (job.format && pendingLength >= job.format.sampleRate * MIN_CHUNK_SECONDS) flush(false);
        return;
      }
      detach();
      if (this.answering?.requestId === requestId) this.answering = null;
      this.hooks.onWaiting(false);
      if (event.type === 'done') {
        flush(true);
        return;
      }
      if (sentAny) {
        // Part of the sentence already played and cannot be taken back; end
        // it where it stopped, and let the next sentence find out whether the
        // trouble is still there.
        flush(true);
        return;
      }
      if (event.failure === 'maker_failed' && !options.retried) {
        // One retry in silence before anybody is told.
        this.queue.drop(key);
        void this.answer(requestId, text, choice, { retried: true });
        return;
      }
      this.held.set(requestId, { text, choice });
      this.hooks.onFailure(requestId, event.failure);
    };
    const detach = () => job.listeners.delete(listener);
    this.answering = { requestId, detach };

    // What has already arrived is replayed, then the rest follows live.
    for (const samples of job.samples) listener({ type: 'audio', samples });
    if (job.state === 'done') listener({ type: 'done' });
    else if (job.state === 'failed' && job.failure) listener({ type: 'failed', failure: job.failure });
    else job.listeners.add(listener);
  }
}
