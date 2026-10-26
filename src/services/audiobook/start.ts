/**
 * Where a book starts when it is played: a sentence asked for (a tap in the
 * text sheet, the voice changed), a page of the reader ("Listen from here"),
 * the sentence it was last heard at, or its saved place, wherever that was
 * last written (the reader turning pages, or the player itself).
 */
import { sectionText } from '@/features/audiobook/utils/sentence-locator';
import { startIndex, startPlace } from '@/features/audiobook/utils/start-place';
import { offsetOfText } from '@/features/audiobook/utils/text-offset';
import { savedLocator } from '@/services/audiobook/position';
import type { BookScript } from '@/services/audiobook/script';
import { readCurrent, readHeardClock, type HeardClock } from '@/services/audiobook/settings';
import type { SpineLocator } from '@/services/epub-spine';

/**
 * Where a book is asked to start: a sentence, or a reader's page, with the
 * text from the first character on screen when the page could say it
 * (`FIRST_VISIBLE_TEXT_SCRIPT`), which places it exactly.
 */
export type StartFrom = { fromSentenceId?: string | null; fromLocator?: SpineLocator | null; fromText?: string | null };

/** Where to start: a page or a sentence asked for, else the one the book was last heard at, else its saved place, else its first chapter. */
export async function startSentence(script: BookScript, bookId: string, from: StartFrom = {}) {
  if (from.fromLocator) return sentenceAtLocator(script, from.fromLocator, from.fromText);
  const remembered = from.fromSentenceId ?? (readCurrent()?.bookId === bookId ? (readCurrent()?.sentenceId ?? null) : null);
  if (remembered) {
    const section = Number.parseInt(remembered.split(':')[0] ?? '', 10);
    const hit = (await script.load(section))?.sentences.find((x) => x.id === remembered);
    if (hit) return hit;
  }
  return sentenceAtLocator(script, savedLocator(bookId));
}

/**
 * The sentence a reader's place is at (a saved place, the page on screen),
 * or the book's first: the first to begin at or after it. The locator alone
 * only estimates where in its chapter a page is; the page's own text (`text`)
 * found in the chapter's says exactly.
 */
export async function sentenceAtLocator(script: BookScript, locator: SpineLocator | null, text?: string | null) {
  const place = startPlace(script.listened, locator);
  if (!place) return null;
  const at = await script.load(place.section);
  const exact = at && text ? offsetOfText(sectionText(at.paragraphs), text, place.offset) : null;
  const index = at ? startIndex(at.sentences, exact ?? place.offset) : -1;
  if (at && index >= 0) return at.sentences[index];
  const next = script.nextSection(place.section);
  return next ? ((await script.load(next.index))?.sentences[0] ?? null) : null;
}

/**
 * The clock a book last showed, while it still says where play will start
 * (see `startSentence`): the sentence it was left at, in the same voice (a
 * voice paces the clock its own way). Gone once the reader has moved the
 * saved place on, so the player never opens on numbers it would then change.
 */
export function rememberedClock(bookId: string, voiceKey: string): HeardClock | null {
  const clock = readHeardClock(bookId);
  if (!clock || clock.voiceKey !== voiceKey) return null;
  const now = readCurrent();
  if (now?.bookId === bookId) return now.sentenceId === clock.sentenceId ? clock : null;
  const saved = savedLocator(bookId) as { text?: { highlight?: string } } | null;
  return saved?.text?.highlight === clock.sentenceText ? clock : null;
}
