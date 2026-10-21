/**
 * A chapter as the follow-along sheet lists it: a row a paragraph, each
 * holding its sentences, so the sentence being spoken can be lit inside the
 * paragraph that is read around it.
 *
 * Pure, so it can be tested on its own.
 */
import type { Sentence } from '@/features/audiobook/utils/sentences-of';

export interface ParagraphRow {
  /** `<section>:<paragraph n>`. */
  key: string;
  sentences: Sentence[];
}

export function paragraphRows(sentences: readonly Sentence[]): ParagraphRow[] {
  const rows: ParagraphRow[] = [];
  for (const sentence of sentences) {
    const key = `${sentence.section}:${sentence.paragraph}`;
    const last = rows[rows.length - 1];
    if (last?.key === key) last.sentences.push(sentence);
    else rows.push({ key, sentences: [sentence] });
  }
  return rows;
}

/** The row holding a sentence, or -1. */
export function rowOf(rows: readonly ParagraphRow[], sentenceId: string | null): number {
  if (!sentenceId) return -1;
  const paragraphKey = sentenceId.split(':').slice(0, 2).join(':');
  return rows.findIndex((row) => row.key === paragraphKey);
}
