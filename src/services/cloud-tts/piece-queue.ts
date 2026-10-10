/**
 * The fetches behind a cloud voice: one job per sentence, two running at once.
 *
 * Two is the server's own limit per reader (`tts-guards.ts`), so it is the
 * most worth running. The sentence Readium is waiting for always goes to the
 * front; a guess from the lookahead goes to the back. A job keeps what it has
 * received, so a request arriving halfway through a guess replays the start
 * and follows the rest live, and a finished job is written to the phone's
 * cache and kept in memory only for the few sentences about to be asked for.
 */
import { writeCachedPiece } from '@/services/cloud-tts/audio-cache';
import { PcmDecoder } from '@/services/cloud-tts/pcm';
import { cutPieces } from '@/services/cloud-tts/pieces';
import {
  CloudVoiceError,
  streamPiece,
  type AudioEncoding,
  type CloudVoiceFailure,
  type PieceFormat,
} from '@/services/cloud-tts/request';

export interface CloudVoiceChoice {
  modelId: string;
  voice: string;
  /** The speed to ask the maker for, or null when it does not take one. */
  speed: number | null;
  maxCharacters: number;
  /** MP3 when the native player can decode it, which is a tenth of the bytes; PCM otherwise. */
  format: AudioEncoding;
}

export type JobEvent =
  /** PCM, decoded here, ready for the player. */
  | { type: 'audio'; samples: Float32Array }
  /** MP3 as it arrived, for the native player to decode. */
  | { type: 'encoded'; bytes: Uint8Array }
  | { type: 'done' }
  | { type: 'failed'; failure: CloudVoiceFailure };

export interface Job {
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

const MAX_IN_FLIGHT = 2;
/** Finished jobs kept in memory beyond the cache, for the sentence about to be asked for. */
const KEEP_DONE_JOBS = 6;

export class PieceQueue {
  private readonly jobs = new Map<string, Job>();
  private readonly waiting: Job[] = [];
  private running = 0;
  private stopped = false;

  get(key: string): Job | undefined {
    return this.jobs.get(key);
  }

  create(key: string, text: string, choice: CloudVoiceChoice): Job {
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
    this.forgetOld();
    return job;
  }

  /** The sentence being waited for goes to the front; a guess to the back. */
  enqueue(job: Job, urgent: boolean): void {
    const at = this.waiting.indexOf(job);
    if (at >= 0) this.waiting.splice(at, 1);
    if (urgent) this.waiting.unshift(job);
    else this.waiting.push(job);
    this.pump();
  }

  drop(key: string): void {
    const job = this.jobs.get(key);
    if (!job) return;
    if (job.state === 'queued' || job.state === 'running') job.controller.abort();
    const at = this.waiting.indexOf(job);
    if (at >= 0) this.waiting.splice(at, 1);
    this.jobs.delete(key);
  }

  dispose(): void {
    this.stopped = true;
    for (const job of this.jobs.values()) job.controller.abort();
    this.jobs.clear();
    this.waiting.length = 0;
  }

  private pump(): void {
    while (!this.stopped && this.running < MAX_IN_FLIGHT && this.waiting.length > 0) {
      const job = this.waiting.shift() as Job;
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
      // Nearly always one piece; a sentence over the maker's limit is read
      // as several, in order, as chunks of the one sentence.
      for (const piece of cutPieces(job.text, job.choice.maxCharacters)) {
        let decoder: PcmDecoder | null = null;
        await streamPiece({
          modelId: job.choice.modelId,
          voice: job.choice.voice,
          text: piece,
          speed: job.choice.speed ?? undefined,
          format: job.choice.format,
          signal: job.controller.signal,
          onFormat: (format) => {
            job.format ??= format;
            decoder = format.kind === 'pcm' ? new PcmDecoder(format.channels) : null;
          },
          onBytes: (bytes) => {
            job.raw.push(bytes);
            if (job.format?.kind === 'mp3') {
              emit({ type: 'encoded', bytes });
              return;
            }
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

  /** Finished jobs live in the cache; memory keeps only the last few. */
  private forgetOld(): void {
    const finished = [...this.jobs.values()].filter((job) => job.state === 'done' || job.state === 'failed');
    for (const job of finished.slice(0, Math.max(0, finished.length - KEEP_DONE_JOBS))) {
      if (job.listeners.size === 0) this.jobs.delete(job.key);
    }
  }
}
