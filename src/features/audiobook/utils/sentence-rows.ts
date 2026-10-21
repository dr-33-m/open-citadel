/**
 * A chapter as the follow-along sheet lists it: a row a sentence, as a
 * transcript is a row a line, so the row being spoken is the sentence being
 * spoken and the list can hold it a third of the way down. A row a paragraph
 * could not: a paragraph taller than the sheet was scrolled to its top, and
 * the sentence being heard sat below the fold. Where a paragraph begins, the
 * row says so, and is drawn with room above it.
 *
 * Pure, so it can be tested on its own.
 */
import type { Sentence } from '@/features/audiobook/utils/sentences-of';

export interface SentenceRow {
  sentence: Sentence;
  /** The first sentence of its paragraph. */
  opensParagraph: boolean;
}

export function sentenceRows(sentences: readonly Sentence[]): SentenceRow[] {
  return sentences.map((sentence, i) => ({
    sentence,
    opensParagraph: i === 0 || sentences[i - 1].paragraph !== sentence.paragraph,
  }));
}

/** The row holding a sentence, or -1. */
export function rowOf(rows: readonly SentenceRow[], sentenceId: string | null): number {
  if (!sentenceId) return -1;
  return rows.findIndex((row) => row.sentence.id === sentenceId);
}
