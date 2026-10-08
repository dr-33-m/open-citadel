/**
 * Guessing the next sentence, and knowing when to stop guessing.
 *
 * Readium asks for a sentence only when it is due: on Android about a second
 * before the one playing ends, on iOS only once it has. A cloud round trip
 * per sentence would leave a gap between every two of them, so the next one
 * or two are fetched ahead from the rest of the paragraph Readium hands over
 * with each utterance (`locator.text.after`).
 *
 * A guess that is never asked for is audio paid for and never played, so the
 * guessing is watched: when fewer than half of the guesses made are asked for,
 * it stops for the rest of the session and every sentence is fetched as it
 * comes. The end of a paragraph cannot be guessed at all (`after` stops
 * there), so the first sentence of each paragraph is always fetched on
 * demand; a lookahead hint from the native side is the real fix, and is
 * named in CLOUD-VOICES-HANDOVER.md.
 *
 * Pure, so it can be tested on its own.
 */
import { normaliseUtterance, splitSentences } from '@/services/cloud-tts/sentences';

/** How far ahead to fetch. Two is the most the server allows in flight. */
export const LOOKAHEAD_DEPTH = 2;
/** Guesses to see before judging them, so one odd paragraph does not decide. */
const JUDGE_AFTER = 8;
const MIN_HIT_RATE = 0.5;

export class Lookahead {
  private readonly guessed = new Set<string>();
  private readonly asked = new Set<string>();
  private hits = 0;
  private stopped = false;

  /** The next sentences worth fetching, given what is being read and the rest of its paragraph. */
  predict(after: string | null | undefined): string[] {
    if (this.stopped || !after) return [];
    const next = splitSentences(after).slice(0, LOOKAHEAD_DEPTH);
    for (const sentence of next) {
      const key = normaliseUtterance(sentence);
      // A sentence asked for before the guess is not a guess at all.
      if (!this.asked.has(key)) this.guessed.add(key);
    }
    return next;
  }

  /** A sentence Readium asked for. Returns whether it had been guessed. */
  recordRequest(text: string): boolean {
    const key = normaliseUtterance(text);
    this.asked.add(key);
    const hit = this.guessed.has(key);
    if (hit) this.hits += 1;
    if (this.guessed.size >= JUDGE_AFTER && this.hits / this.guessed.size < MIN_HIT_RATE) {
      this.stopped = true;
    }
    return hit;
  }

  get active(): boolean {
    return !this.stopped;
  }
}
