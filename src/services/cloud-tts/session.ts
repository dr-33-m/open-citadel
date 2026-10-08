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
import { readCachedPiece, writeCachedPiece } from '@/services/cloud-tts/audio-cache';
import { pieceCacheKey } from '@/services/cloud-tts/cache-key';
import { Lookahead } from '@/services/cloud-tts/lookahead';
import { PcmDecoder, floatBytes } from '@/services/cloud-tts/pcm';
import { cutPieces } from '@/services/cloud-tts/pieces';
import { CloudVoiceError, streamPiece, type CloudVoiceFailure, type PieceFormat } from '@/services/cloud-tts/request';

export interface CloudVoiceChoice {
  modelId: string;
  voice: string;
  /** The speed to ask the maker for, or null when it does not take one. */
  speed: number | null;
  maxCharacters: number;
}

export interface CloudSessionHooks {
  provide(requestId: string, samples: ArrayBuffer, sampleRate: number, isLast: boolean): void;
  onFailure(requestId: string, failure: CloudVoiceFailure): void;
  /** True from a sentence being asked for until its first audio is handed on. */
  onWaiting(waiting: boolean): void;
}

const MAX_IN_FLIGHT = 2;
/** About a fifth of a second: fewer bridge calls, and still no wait worth hearing. */
const MIN_CHUNK_SECONDS = 0.2;
/** Finished guesses kept in memory beyond the cache, for the sentence about to be asked for. */
const KEEP_DONE_JOBS = 6;

type JobEvent = { type: 'audio'; samples: Float32Array } | { type: 'done' } | { type: 'failed'; failure: CloudVoiceFailure };

interface Job {
  key: string;
  text: string;
  choice: CloudVoiceChoice;
  format: PieceFormat | null;
  raw: Uint8Array[];
  samples: Float32Array[];
  state: 'queued' | 'running' | 'done' | 'failed';
  failure: CloudVoiceFailure | null;
  listeners: Set<(event: JobEvent) => void>;
  controller: AbortController;
}

export class CloudVoiceSession {
  private readonly jobs = new Map<string, Job>();
  private readonly queue: Job[] = [];
  private running = 0;
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
      if (!this.jobs.has(key)) void this.prefetch(key, text, choice);
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
    this.dropJob(this.keyFor(held.text, next));
    void this.answer(requestId, held.text, next, { retried: true });
  }

  dispose(): void {
    this.disposed = true;
    this.answering?.detach();
    this.answering = null;
    for (const job of this.jobs.values()) job.controller.abort();
    this.jobs.clear();
    this.queue.length = 0;
    this.held.clear();
  }

  private keyFor(text: string, choice: CloudVoiceChoice): string {
    return pieceCacheKey({ bookId: this.bookId, modelId: choice.modelId, voice: choice.voice, speed: choice.speed, text });
  }

  private async prefetch(key: string, text: string, choice: CloudVoiceChoice): Promise<void> {
    // Reserve the slot in the map before the cache read, so a guess made twice
    // in quick succession is fetched once.
    const job = this.createJob(key, text, choice);
    if (await readCachedPiece(key)) {
      if (this.jobs.get(key) === job && job.state === 'queued') this.dropJob(key);
      return;
    }
    this.enqueue(job, false);
  }

  private async answer(requestId: string, text: string, choice: CloudVoiceChoice, options: { retried: boolean }): Promise<void> {
    this.answering?.detach();
    const key = this.keyFor(text, choice);
    const cached = this.jobs.has(key) ? null : await readCachedPiece(key);
    if (this.disposed) return;
    if (cached) {
      this.answering = null;
      this.hooks.onWaiting(false);
      this.hooks.provide(requestId, floatBytes(cached.samples), cached.sampleRate, true);
      return;
    }

    let job = this.jobs.get(key);
    if (!job || job.state === 'failed') {
      if (job) this.dropJob(key);
      job = this.createJob(key, text, choice);
    }
    if (job.state === 'queued') this.enqueue(job, true);

    this.hooks.onWaiting(true);
    let sentAny = false;
    let pending: Float32Array[] = [];
    let pendingLength = 0;
    const flush = (isLast: boolean) => {
      if (!job.format) return;
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
        this.dropJob(key);
        void this.answer(requestId, text, choice, { retried: true });
        return;
      }
      this.hooks.onWaiting(false);
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

  private createJob(key: string, text: string, choice: CloudVoiceChoice): Job {
    const job: Job = {
      key,
      text,
      choice,
      format: null,
      raw: [],
      samples: [],
      state: 'queued',
      failure: null,
      listeners: new Set(),
      controller: new AbortController(),
    };
    this.jobs.set(key, job);
    this.forgetOldJobs();
    return job;
  }

  /** The sentence being waited for goes to the front; a guess to the back. */
  private enqueue(job: Job, urgent: boolean): void {
    const at = this.queue.indexOf(job);
    if (at >= 0) this.queue.splice(at, 1);
    if (urgent) this.queue.unshift(job);
    else this.queue.push(job);
    this.pump();
  }

  private pump(): void {
    while (!this.disposed && this.running < MAX_IN_FLIGHT && this.queue.length > 0) {
      const job = this.queue.shift() as Job;
      if (job.state !== 'queued') continue;
      job.state = 'running';
      this.running += 1;
      void this.run(job).finally(() => {
        this.running -= 1;
        this.pump();
      });
    }
  }

  private async run(job: Job): Promise<void> {
    const emit = (event: JobEvent) => {
      for (const listener of [...job.listeners]) listener(event);
    };
    try {
      for (const piece of cutPieces(job.text, job.choice.maxCharacters)) {
        let decoder: PcmDecoder | null = null;
        await streamPiece({
          modelId: job.choice.modelId,
          voice: job.choice.voice,
          text: piece,
          speed: job.choice.speed ?? undefined,
          signal: job.controller.signal,
          onFormat: (format) => {
            job.format ??= format;
            decoder = new PcmDecoder(format.channels);
          },
          onBytes: (bytes) => {
            job.raw.push(bytes);
            const samples = (decoder as PcmDecoder | null)?.push(bytes);
            if (!samples || samples.length === 0) return;
            job.samples.push(samples);
            emit({ type: 'audio', samples });
          },
        });
      }
      job.state = 'done';
      emit({ type: 'done' });
      if (job.format) void writeCachedPiece(job.key, job.raw, job.format);
    } catch (error) {
      if (job.controller.signal.aborted) return;
      job.state = 'failed';
      job.failure = error instanceof CloudVoiceError ? error.failure : 'maker_failed';
      emit({ type: 'failed', failure: job.failure });
    }
  }

  private dropJob(key: string): void {
    const job = this.jobs.get(key);
    if (!job) return;
    if (job.state === 'queued' || job.state === 'running') job.controller.abort();
    const at = this.queue.indexOf(job);
    if (at >= 0) this.queue.splice(at, 1);
    this.jobs.delete(key);
  }

  /** Finished jobs live in the cache; memory keeps only the last few. */
  private forgetOldJobs(): void {
    const done = [...this.jobs.values()].filter((job) => job.state === 'done' || job.state === 'failed');
    for (const job of done.slice(0, Math.max(0, done.length - KEEP_DONE_JOBS))) {
      if (job.listeners.size === 0) this.jobs.delete(job.key);
    }
  }
}
