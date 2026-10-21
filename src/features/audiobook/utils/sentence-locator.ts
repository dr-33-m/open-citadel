/**
 * A sentence of the book as a Readium locator: what a highlight saved from
 * the player is anchored by, and what the book's saved place becomes while
 * it is heard.
 *
 * Readium finds a decoration by its quoted text and the words either side of
 * it, so a highlight carries up to 120 characters of each, cut at the
 * section's edges. The saved place carries only the sentence, which is enough
 * for the reader to open on it.
 *
 * Pure, so it can be tested on its own.
 */
import type { ScriptParagraph, Sentence } from '@/features/audiobook/utils/sentences-of';

/** Characters of context kept either side of a highlighted sentence. */
export const CONTEXT_CHARS = 120;
/** What the index counts between two paragraphs (`book-text/store`). */
const SEPARATOR = '\n\n';

export interface LocatorSection {
  href: string;
  title: string | null;
  chars: number;
}

export interface SentenceLocator {
  href: string;
  type: string;
  title?: string;
  locations: { progression: number; totalProgression?: number };
  text: { before?: string; highlight: string; after?: string };
}

/** A section's text as the index counts it, so a sentence's offset points into it. */
export function sectionText(paragraphs: readonly ScriptParagraph[]): string {
  return paragraphs.map((p) => p.text).join(SEPARATOR);
}

function progressionOf(section: LocatorSection, offset: number): number {
  return section.chars > 0 ? Math.min(1, Math.max(0, offset / section.chars)) : 0;
}

/** Where a sentence is, for the saved place: no context, the reader opens on it. */
export function placeLocator(section: LocatorSection, sentence: Sentence, totalProgression?: number): SentenceLocator {
  return {
    href: section.href,
    type: 'application/xhtml+xml',
    ...(section.title ? { title: section.title } : {}),
    locations: {
      progression: progressionOf(section, sentence.offset),
      ...(totalProgression != null ? { totalProgression } : {}),
    },
    text: { highlight: sentence.text },
  };
}

/** A sentence to highlight, with the words around it for Readium to find it by. */
export function highlightLocator(section: LocatorSection, sentence: Sentence, text: string): SentenceLocator {
  const end = sentence.offset + sentence.text.length;
  const before = text.slice(Math.max(0, sentence.offset - CONTEXT_CHARS), sentence.offset);
  const after = text.slice(end, end + CONTEXT_CHARS);
  return {
    ...placeLocator(section, sentence),
    text: { ...(before ? { before } : {}), highlight: sentence.text, ...(after ? { after } : {}) },
  };
}

/** Under this far into a sentence, a Highlight tap was meant for the one that just ended. */
export const LATE_TAP_SEC = 1;

/** Which sentence a Highlight tap means: the one playing, or the one before when it has only just begun. */
export function highlightTarget(index: number, intoSentenceSec: number): number {
  return intoSentenceSec < LATE_TAP_SEC && index > 0 ? index - 1 : index;
}

/** How far through the whole book a place is, by characters: the share the Library's bar draws. */
export function bookFraction(sections: readonly { index: number; chars: number }[], section: number, offset: number): number {
  let before = 0;
  let total = 0;
  for (const s of sections) {
    total += s.chars;
    if (s.index < section) before += s.chars;
  }
  if (!(total > 0)) return 0;
  return Math.min(1, Math.max(0, (before + offset) / total));
}
