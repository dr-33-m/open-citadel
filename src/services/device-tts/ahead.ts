/**
 * The next sentence in an Enhanced voice, made while the current one plays.
 *
 * Readium asks for a sentence only when it is due (on iOS, only once the one
 * before has finished playing), and an on-device model on a mid-range phone
 * makes speech about as fast as it is spoken, or slower. So every sentence
 * used to start with the wait for its first chunk. The patched Readium now
 * says what it will ask for next (`onTTSUpcoming`), and this makes that
 * sentence in the gap: the engine is idle while the current one plays out.
 *
 * Two rules from the engine shape it (`engine.ts`):
 *
 *  - One synthesis at a time, in the order asked. So a sentence is only
 *    prepared once the one being answered has finished making, never queued
 *    behind it: a queued generator that is then abandoned before it starts
 *    would hold the engine's queue for ever.
 *  - Stopping is the only way to cancel a running synthesis, and a stopped
 *    one ends as if it had finished. So a stop is recorded here first, and
 *    what it cut short is thrown away rather than played as a whole sentence.
 *
 * At most one sentence is prepared: the next. On a slower phone that is all
 * the gap allows, and a guess further ahead is work thrown away on a skip.
 */
import { stop as stopSynthesis, synthesize } from '@/services/device-tts/engine';
import type { AiVoice } from '@/services/device-tts/catalogue';
import type { SpeechChunk } from '@/services/device-tts/pace';

interface Wanted {
  text: string;
  voice: AiVoice;
  speed: number;
}

interface Prepared extends Wanted {
  chunks: SpeechChunk[];
  state: 'running' | 'done' | 'failed';
  stopped: boolean;
  listeners: Set<() => void>;
}

function same(a: Wanted, b: Wanted): boolean {
  // Speed within a hair: the native side hands the rate back as a double made
  // from a float, so 1.1 comes back as 1.1000000238.
  return a.text.trim() === b.text.trim() && a.voice === b.voice && Math.abs(a.speed - b.speed) < 1e-3;
}

export class DeviceSpeechAhead {
  private prepared: Prepared | null = null;
  private wanted: Wanted | null = null;
  private answering = 0;

  /** Readium has said what comes next. It is made once the engine is free. */
  want(text: string, voice: AiVoice, speed: number): void {
    const next = { text, voice, speed };
    if (this.prepared && same(this.prepared, next)) return;
    this.wanted = next;
    this.startIfFree();
  }

  /** The bridge is answering a request: nothing is prepared over the top of it. */
  begin(): void {
    this.answering += 1;
  }

  end(): void {
    this.answering = Math.max(0, this.answering - 1);
    this.startIfFree();
  }

  /**
   * The prepared sentence, streamed (what is made so far, then the rest as
   * it comes), when it is the one asked for. Null otherwise; the caller then
   * makes it live, after `cancel` has cleared whatever was being prepared.
   */
  take(text: string, voice: AiVoice, speed: number): AsyncGenerator<SpeechChunk> | null {
    const job = this.prepared;
    if (!job || job.state === 'failed' || !same(job, { text, voice, speed })) return null;
    this.prepared = null;
    return replay(job);
  }

  /**
   * A skip, a stop or a pause: nothing more is made, and a sentence still
   * being made is stopped and thrown away. One already whole is kept, since a
   * resume or a skip forward may ask for exactly it; `take` ignores it if not.
   */
  cancel(): void {
    this.wanted = null;
    const job = this.prepared;
    if (job?.state !== 'running') return;
    this.prepared = null;
    job.stopped = true;
    stopSynthesis();
  }

  private startIfFree(): void {
    if (this.answering > 0 || !this.wanted) return;
    if (this.prepared?.state === 'running') return;
    const job: Prepared = { ...this.wanted, chunks: [], state: 'running', stopped: false, listeners: new Set() };
    this.wanted = null;
    this.prepared = job;
    void this.make(job);
  }

  private async make(job: Prepared): Promise<void> {
    try {
      for await (const chunk of synthesize(job.text, { voice: job.voice, speed: job.speed })) {
        job.chunks.push(chunk);
        notify(job);
      }
      job.state = job.stopped ? 'failed' : 'done';
    } catch {
      job.state = 'failed';
    }
    notify(job);
    if (this.prepared === job && job.state === 'failed') this.prepared = null;
    this.startIfFree();
  }
}

function notify(job: Prepared): void {
  for (const listener of [...job.listeners]) listener();
}

async function* replay(job: Prepared): AsyncGenerator<SpeechChunk> {
  let index = 0;
  for (;;) {
    if (index < job.chunks.length) {
      yield job.chunks[index++];
      continue;
    }
    if (job.state === 'done') return;
    if (job.state === 'failed') throw new Error('Speech synthesis failed');
    await new Promise<void>((resolve) => {
      const listener = () => {
        job.listeners.delete(listener);
        resolve();
      };
      job.listeners.add(listener);
    });
  }
}
