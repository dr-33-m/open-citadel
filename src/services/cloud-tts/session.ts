/**
 * The cloud voice's side of Readium's synthesis bridge, for one book.
 *
 * Readium's native engine asks JS for each sentence (`onTTSSynthesisRequest`)
 * and plays whatever mono Float32 comes back (`ttsProvideAudioChunk`), any
 * rate, any number of chunks. On-device voices answer it by synthesizing on
 * the phone; this answers it from the cloud, and Readium never knows the
 * difference: highlighting, pause, skip, page turns and the lock screen stay
 * exactly where they were. It works on any build; a build with the patched
 * Readium also says what comes next (`upcoming`) and decodes MP3 itself, so
 * pieces are fetched ahead exactly and cost a tenth of the data.
 *
 * A sentence is answered from, in order: the phone's cache, a fetch already
 * running for it (from Readium's list, or a guess from `Lookahead` on an older
 * build), or a fresh fetch. Audio is handed
 * on as it arrives so the first words play while the rest is being made. At
 * most two fetches run at once, the server's own limit, with the sentence
 * being waited for always first in line.
 *
 * A failure is never answered with `ttsSynthesisFailed`: on Android that
 * quietly restarts the book on the phone's own voice. The request is held
 * open instead and the failure handed to `onFailure`, so the reader can be
 * shown what happened and choose (`use-cloud-voice-failure.ts`).
 */
import { MP3_MIME, createForwarder, type PlayerHooks } from '@/services/cloud-tts/forward';
import { LOOKAHEAD_DEPTH, Lookahead } from '@/services/cloud-tts/lookahead';
import { floatBytes } from '@/services/cloud-tts/pcm';
import type { CloudVoiceChoice, Job } from '@/services/cloud-tts/piece-queue';
import { PieceSource } from '@/services/cloud-tts/piece-source';
import type { CloudVoiceFailure } from '@/services/cloud-tts/request';

export type { CloudVoiceChoice } from '@/services/cloud-tts/piece-queue';

export interface CloudSessionHooks extends PlayerHooks {
  onFailure(requestId: string, failure: CloudVoiceFailure): void;
  /** True from a sentence being asked for until its first audio is handed on. */
  onWaiting(waiting: boolean): void;
}

export class CloudVoiceSession {
  private readonly source: PieceSource;
  private readonly lookahead = new Lookahead();
  /** The request being answered now, and how to stop answering it. */
  private answering: { requestId: string; detach: () => void } | null = null;
  /** Requests held open after a failure, kept so they can be tried again. */
  private readonly held = new Map<string, { text: string; choice: CloudVoiceChoice }>();
  private disposed = false;
  /**
   * Readium has said what comes next (`upcoming`), so the guesses from the
   * rest of the paragraph are not needed: they are only ever second best.
   */
  private exact = false;

  constructor(
    bookId: string,
    private readonly hooks: CloudSessionHooks,
  ) {
    this.source = new PieceSource(bookId);
  }

  /** Readium asked for a sentence. */
  request(requestId: string, text: string, choice: CloudVoiceChoice): void {
    this.lookahead.recordRequest(text);
    void this.answer(requestId, text, choice, { retried: false });
  }

  /**
   * Readium has said exactly what it will ask for next (the patch's
   * `onTTSUpcoming`): fetch the next one or two ahead, across paragraphs.
   */
  upcoming(texts: readonly string[], choice: CloudVoiceChoice): void {
    this.exact = true;
    for (const text of texts.slice(0, LOOKAHEAD_DEPTH)) void this.source.prefetch(text, choice);
  }

  /**
   * Readium moved to a sentence; guess the next one or two from the rest of
   * its paragraph. Only for a build without the exact list above.
   */
  utterance(after: string | null | undefined, choice: CloudVoiceChoice): void {
    if (this.exact) return;
    for (const text of this.lookahead.predict(after)) void this.source.prefetch(text, choice);
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
    this.source.drop(held.text, next);
    void this.answer(requestId, held.text, next, { retried: true });
  }

  dispose(): void {
    this.disposed = true;
    this.answering?.detach();
    this.answering = null;
    this.source.dispose();
    this.held.clear();
  }

  private async answer(requestId: string, text: string, choice: CloudVoiceChoice, options: { retried: boolean }): Promise<void> {
    this.answering?.detach();
    let job: Job | null = null;
    let detach = () => {};
    this.answering = { requestId, detach: () => detach() };
    const out = createForwarder(requestId, this.hooks, () => job?.format ?? null, () => this.hooks.onWaiting(false));

    const answer = await this.source.answer(
      text,
      choice,
      (event, from) => {
        job = from;
        if (event.type === 'audio') {
          out.pcm(event.samples);
          return;
        }
        if (event.type === 'encoded') {
          out.mp3(event.bytes);
          return;
        }
        this.settle(requestId);
        // Part of the sentence already played cannot be taken back: a failure
        // after it ends the sentence where it stopped, and the next sentence
        // finds out whether the trouble is still there.
        if (event.type === 'done' || out.started) {
          out.end();
          return;
        }
        this.held.set(requestId, { text, choice });
        this.hooks.onFailure(requestId, event.failure);
      },
      { ...options, onLive: () => this.hooks.onWaiting(true) },
    );
    if (!answer || this.disposed) return;
    if (answer.kind === 'live') {
      detach = answer.detach;
      return;
    }
    this.settle(requestId);
    const cached = answer.piece;
    if (cached.kind === 'mp3') {
      const bytes = cached.bytes.buffer.slice(cached.bytes.byteOffset, cached.bytes.byteOffset + cached.bytes.byteLength);
      this.hooks.provideEncoded(requestId, bytes as ArrayBuffer, MP3_MIME, true);
    } else {
      this.hooks.provide(requestId, floatBytes(cached.samples), cached.sampleRate, true);
    }
  }

  /** The request is answered, one way or another: nothing is being waited for on its account. */
  private settle(requestId: string): void {
    if (this.answering?.requestId === requestId) this.answering = null;
    this.hooks.onWaiting(false);
  }
}
