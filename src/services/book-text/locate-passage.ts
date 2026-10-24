import { eq } from 'drizzle-orm';
import type { Locator } from '@dr33m/react-native-readium';

import { db } from '@/db/client';
import { highlights, readingProgress } from '@/db/schema';
import type { BookRow as Book } from '@/services/book-text/book-row';
import { bookTextDriver } from '@/services/book-text/driver';
import { readablePart, type ReadableExtent } from '@/services/book-text/extent';
import { findQuote, readerHref, type QuoteSpan } from '@/services/book-text/quote-anchor';
import { bookExtent } from '@/services/book-text/reading';
import { epubBasename } from '@/services/epub-spine';
import { paragraphsOf, type StoredSection } from '@/services/book-text/store';

/** Context kept either side of a highlight, which the reader uses to tell two copies of a phrase apart. */
const CONTEXT_CHARS = 120;
/** What a section's paragraphs are joined with, as the index counts `start` across them. */
const SEPARATOR = '\n\n';

/** A passage found in a book: the book's own words, and a locator the reader can draw it at. */
export interface LocatedPassage {
  text: string;
  locator: Locator;
}

/**
 * How far past the saved position the current chapter is searched: about a
 * page. The saved position is the top of the page on screen, so the passage a
 * reader is looking at when they ask for it to be highlighted sits just past
 * it, and was "not read yet". Only the quote itself comes back to Samwell, so
 * a page's grace gives nothing away.
 */
const PAGE_AHEAD_CHARS = 3_000;

/** A turn of the event loop between sections, so a long book never holds the screen. */
const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Finds quoted passages in one book, as many as asked, reading the book once. */
export type PassageFinder = (quote: string) => Promise<LocatedPassage | { error: string }>;

/**
 * Finds quoted passages in what the reader has read of a book and anchors
 * each where it is, so a highlight made from it is drawn on that passage.
 *
 * A suggested highlight used to be saved at the reader's position at the
 * time: the timeline showed it, and the book never did, because the reader
 * draws a highlight by finding its text on the page and the page it was
 * pointed at held some other text. Now the passage is looked up in the
 * book's text index (current chapter first, then back towards the start),
 * verbatim before loose, and never more than a page past the reader.
 *
 * Each section is read the first time a search reaches it and kept for the
 * rest: the verbatim pass stops at the first section that holds the quote,
 * which is nearly always the chapter in view, so one quote rarely reads more
 * than that; moving a dozen old highlights still reads the book at most once.
 */
export async function passageFinder(book: Book): Promise<PassageFinder | { error: string }> {
  const known = await bookExtent(book);
  if (!known) return { error: 'book_unreadable' };
  const { sections } = known;
  if (known.extent.lastSection < 0) return { error: 'nothing_read_yet' };
  const extent: ReadableExtent = { ...known.extent, lastSectionChars: known.extent.lastSectionChars + PAGE_AHEAD_CHARS };

  const reached = sections.filter((section) => section.index <= extent.lastSection).sort((a, b) => b.index - a.index);
  const driver = await bookTextDriver();
  const read = new Map<number, Promise<string>>();
  const textOf = (section: StoredSection) => {
    let text = read.get(section.index);
    if (!text) {
      text = readText(driver, book.id, section, extent);
      read.set(section.index, text);
    }
    return text;
  };
  const template = readerTemplate(book.id, sections);

  return async (quote) => {
    let found: { section: StoredSection; text: string; span: QuoteSpan } | null = null;
    for (const section of reached) {
      const text = await textOf(section);
      const span = findQuote(text, quote);
      if (span) {
        found = { section, text, span };
        break;
      }
      await breathe();
    }
    if (!found) {
      for (const section of reached) {
        const text = await textOf(section);
        const span = findQuote(text, quote, true);
        if (span && (!found || span.score > found.span.score)) found = { section, text, span };
        await breathe();
      }
    }
    if (!found) return { error: 'quote_not_found' };
    return anchor(found.section, found.text, found.span, template);
  };
}

/** One quote in one book: `passageFinder` for a single passage. */
export async function locatePassage(book: Book, quote: string): Promise<LocatedPassage | { error: string }> {
  const find = await passageFinder(book);
  return typeof find === 'function' ? find(quote) : find;
}

/** The passage as the book has it, and a locator the reader draws it at. */
function anchor(
  section: StoredSection,
  text: string,
  span: QuoteSpan,
  template: { href: string; spinePath: string; type: string } | null,
): LocatedPassage {
  const highlight = text.slice(span.start, span.end).split(SEPARATOR).join('\n');
  return {
    text: highlight,
    locator: {
      href: readerHref(section.href, template),
      type: template?.type ?? 'application/xhtml+xml',
      ...(section.title ? { title: section.title } : {}),
      locations: { progression: section.chars > 0 ? Math.min(1, span.start / section.chars) : 0 },
      text: {
        before: text.slice(Math.max(0, span.start - CONTEXT_CHARS), span.start).split(SEPARATOR).join('\n'),
        highlight,
        after: text.slice(span.end, span.end + CONTEXT_CHARS).split(SEPARATOR).join('\n'),
      },
    },
  };
}

/** A section's text as far as the reader has read it, paragraphs joined as the index counts them. */
async function readText(
  driver: Awaited<ReturnType<typeof bookTextDriver>>,
  bookId: string,
  section: StoredSection,
  extent: ReadableExtent,
): Promise<string> {
  const rows = await paragraphsOf(driver, bookId, section.index, 1, Math.max(1, section.paragraphs));
  const parts: string[] = [];
  for (const row of rows) {
    const part = readablePart(extent, row.section, row.start, row.text);
    if (part === null) break;
    parts.push(part);
  }
  return parts.join(SEPARATOR);
}

/**
 * A locator the reader itself made in this book, with the spine path of its
 * section: how this book's resources are named by the reader. The saved
 * position first, then any highlight made in the reader.
 */
function readerTemplate(bookId: string, sections: readonly StoredSection[]): { href: string; spinePath: string; type: string } | null {
  const progress = db.select({ locator: readingProgress.locator }).from(readingProgress).where(eq(readingProgress.bookId, bookId)).get();
  const marked = db.select({ locator: highlights.locator }).from(highlights).where(eq(highlights.bookId, bookId)).all();
  for (const json of [progress?.locator, ...marked.map((row) => row.locator)]) {
    const locator = parse(json);
    if (!locator?.href) continue;
    const base = epubBasename(locator.href);
    const section = sections.find((s) => epubBasename(s.href) === base);
    if (section) return { href: locator.href, spinePath: section.href, type: locator.type || 'application/xhtml+xml' };
  }
  return null;
}

function parse(json: string | null | undefined): Locator | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as Locator;
  } catch {
    return null;
  }
}
