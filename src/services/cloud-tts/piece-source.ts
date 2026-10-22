/**
 * Where a sentence in a cloud voice comes from, for whoever wants it: the
 * reader's read-aloud (`session.ts`) and the audiobook (`services/audiobook`).
 *
 * The rule, in one place: the phone's cache, then a fetch already running for
 * it, then a fresh fetch. A fetch that fails because the maker did, before any
 * audio arrived, is tried once more in silence before anybody is told. Two
 * copies of this rule would drift, and both features pay for the audio, so a
 * sentence the audiobook made plays from the cache when the reader asks for it.
 */
import { pieceFileUri, readCachedPiece, type CachedPiece } from '@/services/cloud-tts/audio-cache';
import { pieceCacheKey } from '@/services/cloud-tts/cache-key';
import { PieceQueue, type CloudVoiceChoice, type Job, type JobEvent } from '@/services/cloud-tts/piece-queue';
import { CloudVoiceError } from '@/services/cloud-tts/request';

export type PieceAnswer =
  /** Played before: the whole of it, from the phone. */
  | { kind: 'cached'; piece: CachedPiece }
  /** On its way: `listener` is given what has already arrived, then the rest as it lands. */
  | { kind: 'live'; detach: () => void };

export class PieceSource {
  private readonly queue = new PieceQueue();
  private disposed = false;

  constructor(private readonly bookId: string) {}

  keyFor(text: string, choice: CloudVoiceChoice): string {
    return pieceCacheKey({ bookId: this.bookId, modelId: choice.modelId, voice: choice.voice, speed: choice.speed, text });
  }

  /** Whether a fetch for this sentence is already in hand, running or done. */
  has(text: string, choice: CloudVoiceChoice): boolean {
    return this.queue.get(this.keyFor(text, choice)) !== undefined;
  }

  /** Fetch a sentence ahead of being asked for, at the back of the line, unless it is cached or already coming. */
  async prefetch(text: string, choice: CloudVoiceChoice): Promise<void> {
    const key = this.keyFor(text, choice);
    if (this.queue.get(key)) return;
    // Reserve the slot before the cache read, so a guess made twice in quick
    // succession is fetched once.
    const job = this.queue.create(key, text, choice);
    if (await readCachedPiece(key, choice.format === 'mp3')) {
      if (this.queue.get(key) === job && job.state === 'queued') this.queue.drop(key);
      return;
    }
    this.queue.enqueue(job, false);
  }

  /**
   * A sentence, by the rule above. `retried` is true for a sentence the
   * listener asked to try again: it has had its silent retry already. Null
   * once the source has been put away.
   */
  async answer(
    text: string,
    choice: CloudVoiceChoice,
    /** Each event, with the job it came from (whose `format` says how to read its audio). */
    listener: (event: JobEvent, job: Job) => void,
    options: {
      retried?: boolean;
      /** Not cached: called once, before anything already received is replayed. */
      onLive?: () => void;
    } = {},
  ): Promise<PieceAnswer | null> {
    const key = this.keyFor(text, choice);
    const cached = this.queue.get(key) ? null : await readCachedPiece(key, choice.format === 'mp3');
    if (this.disposed) return null;
    if (cached) return { kind: 'cached', piece: cached };

    let retried = options.retried ?? false;
    let detachCurrent: () => void = () => {};
    const follow = () => {
      const job = this.urgentJob(key, text, choice);
      let delivered = false;
      const own = (event: JobEvent) => {
        if (event.type === 'audio' || event.type === 'encoded') delivered = true;
        if (event.type === 'failed' && event.failure === 'maker_failed' && !delivered && !retried) {
          // One retry in silence before anybody is told.
          retried = true;
          detachCurrent();
          this.queue.drop(key);
          follow();
          return;
        }
        if (event.type === 'done' || event.type === 'failed') detachCurrent();
        listener(event, job);
      };
      detachCurrent = () => job.listeners.delete(own);
      replay(job, own);
    };
    options.onLive?.();
    follow();
    return { kind: 'live', detach: () => detachCurrent() };
  }

  /**
   * A sentence made whole and kept on the phone as a file the native player
   * can open. Resolves with the cache key once the file is written; rejects
   * with a `CloudVoiceError`.
   */
  async whole(text: string, choice: CloudVoiceChoice): Promise<string> {
    const key = this.keyFor(text, choice);
    if (await pieceFileUri(key)) return key;
    await new Promise<void>((resolve, reject) => {
      void this.answer(text, choice, (event) => {
        if (event.type === 'done') void (event.saved ?? Promise.resolve()).then(() => resolve());
        else if (event.type === 'failed') reject(new CloudVoiceError(event.failure, 'The voice could not make this sentence.'));
      }).then((answer) => {
        if (!answer) reject(new Error('Put away.'));
        else if (answer.kind === 'cached') resolve();
      });
    });
    return key;
  }

  /** Forget a sentence's fetch, so the next answer starts it again (after "Try again", or in another voice). */
  drop(text: string, choice: CloudVoiceChoice): void {
    this.queue.drop(this.keyFor(text, choice));
  }

  dispose(): void {
    this.disposed = true;
    this.queue.dispose();
  }

  /** The job for a sentence being waited for: the running one, or a new one at the front of the line. */
  private urgentJob(key: string, text: string, choice: CloudVoiceChoice): Job {
    let found = this.queue.get(key);
    if (!found || found.state === 'failed') {
      if (found) this.queue.drop(key);
      found = this.queue.create(key, text, choice);
    }
    if (found.state === 'queued') this.queue.enqueue(found, true);
    return found;
  }
}

/** What a job has already received, then the rest live. */
function replay(job: Job, listener: (event: JobEvent) => void): void {
  if (job.format?.kind === 'mp3') for (const bytes of job.raw) listener({ type: 'encoded', bytes });
  else for (const samples of job.samples) listener({ type: 'audio', samples });
  if (job.state === 'done') listener({ type: 'done', saved: job.saved ?? undefined });
  else if (job.state === 'failed' && job.failure) listener({ type: 'failed', failure: job.failure });
  else job.listeners.add(listener);
}
