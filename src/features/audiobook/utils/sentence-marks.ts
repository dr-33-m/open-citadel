/**
 * Which sentences of a chapter are highlighted in the book, and by which
 * highlight: from the player, from this sheet, or made in the reader. A
 * highlight belongs to the chapter its locator points into, and covers a
 * sentence when one holds the other's words (a reader's highlight can be part
 * of a sentence, or run across several).
 *
 * Pure, so it can be tested on its own.
 */
import type { Sentence } from '@/features/audiobook/utils/sentences-of';

export type SentenceMark = { id: string; color: string };

type MarkSource = { id: string; text: string; locator: string | null; color: string | null };

/** Shorter than this, a reader's highlight is a word or two, found in too many sentences to say which. */
const MIN_CHARS = 12;

const squash = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();

function hrefOf(locator: string | null): string | null {
  try {
    const href = locator ? (JSON.parse(locator) as { href?: unknown }).href : null;
    return typeof href === 'string' ? (href.split('#')[0] ?? null) : null;
  } catch {
    return null;
  }
}

export function sentenceMarks(
  sentences: readonly Sentence[],
  href: string,
  highlights: readonly MarkSource[],
  fallbackColor: string,
): Map<string, SentenceMark> {
  const marks = new Map<string, SentenceMark>();
  const here = highlights.filter((h) => hrefOf(h.locator) === href.split('#')[0]);
  if (here.length === 0) return marks;
  const words = here.map((h) => ({ h, text: squash(h.text) })).filter((x) => x.text.length > 0);
  for (const sentence of sentences) {
    const said = squash(sentence.text);
    const hit = words.find(({ text }) => text.includes(said) || (text.length >= MIN_CHARS && said.includes(text)));
    if (hit) marks.set(sentence.id, { id: hit.h.id, color: hit.h.color || fallbackColor });
  }
  return marks;
}
