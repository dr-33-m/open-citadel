/**
 * Where a book starts when it is played: a sentence asked for (a tap in the
 * text sheet, the voice changed), a page of the reader ("Listen from here"),
 * the sentence it was last heard at, or its saved place, wherever that was
 * last written (the reader turning pages, or the player itself).
 */
import { startIndex, startPlace } from '@/features/audiobook/utils/start-place';
import { savedLocator } from '@/services/audiobook/position';
import type { BookScript } from '@/services/audiobook/script';
import { readCurrent } from '@/services/audiobook/settings';
import type { SpineLocator } from '@/services/epub-spine';

/** Where a book is asked to start: a sentence, or a reader's page. */
export type StartFrom = { fromSentenceId?: string | null; fromLocator?: SpineLocator | null };

/** Where to start: a page or a sentence asked for, else the one the book was last heard at, else its saved place, else its first chapter. */
export async function startSentence(script: BookScript, bookId: string, from: StartFrom = {}) {
  if (from.fromLocator) return sentenceAtLocator(script, from.fromLocator);
  const remembered = from.fromSentenceId ?? (readCurrent()?.bookId === bookId ? (readCurrent()?.sentenceId ?? null) : null);
  if (remembered) {
    const section = Number.parseInt(remembered.split(':')[0] ?? '', 10);
    const hit = (await script.load(section))?.sentences.find((x) => x.id === remembered);
    if (hit) return hit;
  }
  return sentenceAtLocator(script, savedLocator(bookId));
}

/** The sentence a reader's place is at (a saved place, the page on screen), or the book's first. */
export async function sentenceAtLocator(script: BookScript, locator: SpineLocator | null) {
  const place = startPlace(script.listened, locator);
  if (!place) return null;
  const at = await script.load(place.section);
  const index = at ? startIndex(at.sentences, place.offset) : -1;
  if (at && index >= 0) return at.sentences[index];
  const next = script.nextSection(place.section);
  return next ? ((await script.load(next.index))?.sentences[0] ?? null) : null;
}

