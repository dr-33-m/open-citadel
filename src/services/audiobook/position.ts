/**
 * Listening moves the book's saved place: opening the book lands where the
 * audio stopped, the Library's bar follows, Samwell's spoiler line follows
 * what was heard, and a day spent listening dots the Timeline as a day spent
 * reading does. All through `saveReadingPosition`, the reader's own write.
 */
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { readingProgress } from '@/db/schema';
import { bookFraction, highlightLocator, placeLocator, sectionText, type SentenceLocator } from '@/features/audiobook/utils/sentence-locator';
import type { Sentence } from '@/features/audiobook/utils/sentences-of';
import { directionTo, startPlace } from '@/features/audiobook/utils/start-place';
import { offsetOfText } from '@/features/audiobook/utils/text-offset';
import { current, placeSentence, type BookSession } from '@/services/audiobook/session';
import { nowPlayingOf } from '@/services/audiobook/now-playing';
import { writeCurrent, writeHeardClock } from '@/services/audiobook/settings';
import type { SpineLocator } from '@/services/epub-spine';
import { saveReadingPosition } from '@/services/reading-position';

/** Saves on a sentence change at most this often; a pause or a stop always saves. */
const SAVE_EVERY_MS = 5_000;

/** The book's saved place, whatever wrote it, or null for a book never opened or heard. */
export function savedLocator(bookId: string): SpineLocator | null {
  const row = db.select({ locator: readingProgress.locator }).from(readingProgress).where(eq(readingProgress.bookId, bookId)).get();
  if (!row?.locator) return null;
  try {
    return JSON.parse(row.locator) as SpineLocator;
  } catch {
    return null;
  }
}

/** How far through the book a sentence is, by characters. */
export function fractionAt(s: BookSession, sentence: Sentence): number {
  return bookFraction(s.script.sections, sentence.section, sentence.offset);
}

/** Saves the place: now (`force`), or if the last save was a while ago. */
export async function saveBookPlace(s: BookSession, force = false): Promise<void> {
  const sentence = placeSentence(s);
  if (!sentence) return;
  const now = Date.now();
  if (!force && now - s.lastSavedAt < SAVE_EVERY_MS) return;
  s.lastSavedAt = now;
  const section = s.script.section(sentence.section);
  if (!section) return;
  writeCurrent({ bookId: s.info.id, sentenceId: sentence.id });
  // The clock as it shows at the sentence, for the player to open on it next time (`rememberedClock`).
  const { positionSec, durationSec, chapterTitle } = nowPlayingOf(s);
  writeHeardClock(s.info.id, {
    voiceKey: s.voiceKey,
    sentenceId: sentence.id,
    sentenceText: sentence.text,
    positionSec,
    durationSec,
    chapterTitle,
    clockPace: s.clockPace,
    ended: s.script.isLast(sentence),
  });
  const fraction = fractionAt(s, sentence);
  await saveReadingPosition(s.info.id, { ...placeLocator(section, sentence, fraction) }, fraction);
}

/**
 * A sentence as the reader finds it: its file, and its words with the words
 * either side, so the reader anchors it by its text (exactly, on the page it
 * is on) rather than by an estimate of how far through the file it is.
 */
export function sentenceLocator(section: { href: string; title: string | null; chars: number }, paragraphs: Parameters<typeof sectionText>[0], sentence: Sentence): SentenceLocator {
  return highlightLocator(section, sentence, sectionText(paragraphs));
}

/**
 * Which way the voice is from a page of the reader: 1 further on in the book,
 * -1 further back, 0 at its first words, or null when nothing is being heard.
 * The page is placed exactly by `text`, the text from its first character on
 * screen found in the chapter's own, and only estimated without it (the
 * estimate can be a page out, enough to point the wrong way).
 */
export async function voiceDirectionFrom(page: SpineLocator, text?: string | null): Promise<-1 | 0 | 1 | null> {
  const s = current();
  const sentence = s ? placeSentence(s) : null;
  const place = s ? startPlace(s.script.listened, page) : null;
  if (!s || !sentence || !place) return null;
  const chapter = text ? await s.script.load(place.section) : null;
  const exact = chapter && text ? offsetOfText(sectionText(chapter.paragraphs), text, place.offset) : null;
  return directionTo({ section: place.section, offset: exact ?? place.offset }, { section: sentence.section, offset: sentence.offset });
}

/** Where the voice is, as the reader opens on it to read along. */
export function readAlongLocator(): SentenceLocator | null {
  const s = current();
  const sentence = s ? placeSentence(s) : null;
  const script = s && sentence ? s.script.peek(sentence.section) : null;
  if (!s || !sentence || !script) return null;
  return sentenceLocator(script.section, script.paragraphs, sentence);
}
