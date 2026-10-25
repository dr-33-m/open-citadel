/**
 * Finding a sentence of the book's text index from words another reader of
 * the book reported: Readium's read-aloud utterance, which the index cuts and
 * spaces a little differently. Compared on letters and digits alone, and on
 * the opening words, as the native handover does.
 *
 * Pure, so it can be tested on its own.
 */
import type { Sentence } from '@/features/audiobook/utils/sentences-of';

/** How many of a sentence's opening characters identify it. */
const MATCH_CHARS = 40;

export function comparable(text: string): string {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .join(' ');
}

/** The sentence an utterance is (or begins), or null. */
export function matchSentence(sentences: readonly Sentence[], utterance: string): Sentence | null {
  const said = comparable(utterance);
  if (!said) return null;
  const head = said.slice(0, MATCH_CHARS);
  return (
    sentences.find((sentence) => {
      const own = comparable(sentence.text);
      return own.length > 0 && (own.startsWith(head) || said.startsWith(own.slice(0, MATCH_CHARS)));
    }) ?? null
  );
}
