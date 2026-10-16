import { bookTextDriver } from '@/services/book-text/driver';
import { pickSection, reachedSections, readablePart } from '@/services/book-text/extent';
import { bookExtent } from '@/services/book-text/reading';
import { paragraphsOf } from '@/services/book-text/store';
import type { BookRow as Book } from '@/services/book-text/book-row';

/** Roughly five and a half characters a word in English prose, spaces included. */
const CHARS_PER_WORD = 5.7;
/** Paragraphs fetched per read: more than any budget fills, so the budget decides. */
const PARAGRAPH_PAGE = 400;

export interface ChapterSummary {
  /** Spine position: the handle `read_chapter` and a search hit share. */
  index: number;
  title: string | null;
  paragraphs: number;
  approxWords: number;
  /** The reader is partway through it. */
  current: boolean;
}

/** The chapters a reader has reached, with their sizes, front matter left out. */
export async function listReachedChapters(book: Book): Promise<ChapterSummary[] | { error: string }> {
  const known = await bookExtent(book);
  if (!known) return { error: 'book_unreadable' };
  const { sections, extent } = known;
  if (extent.lastSection < 0) return { error: 'nothing_read_yet' };
  return reachedSections(sections, extent).map((section) => {
    const current = section.index === extent.lastSection && Number.isFinite(extent.lastSectionChars);
    const chars = current ? Math.min(section.chars, extent.lastSectionChars) : section.chars;
    return {
      index: section.index,
      title: section.title,
      paragraphs: section.paragraphs,
      approxWords: Math.round(chars / CHARS_PER_WORD / 10) * 10,
      current,
    };
  });
}

export interface ChapterRead {
  index: number;
  title: string | null;
  /** The paragraphs read, numbered as a search numbers them. */
  paragraphs: { n: number; text: string }[];
  /** How many paragraphs the section has in all. */
  total: number;
  /** Where to pick up, when the budget ran out before the section or the reader's position did. */
  next: number | null;
  /** The reading stopped at the reader's position, partway through the section. */
  atPosition: boolean;
}

/**
 * Reads a reached section from paragraph `from` on, until `maxChars` is spent,
 * the section ends, or the reader's position is reached. A long chapter is
 * read in parts by picking up at `next`, and a search hit's surroundings by
 * starting a few paragraphs before it.
 */
export async function readReachedChapter(
  book: Book,
  reference: string,
  from: number,
  maxChars: number,
): Promise<ChapterRead | { error: string }> {
  const known = await bookExtent(book);
  if (!known) return { error: 'book_unreadable' };
  const { sections, extent } = known;
  if (extent.lastSection < 0) return { error: 'nothing_read_yet' };
  const section = pickSection(reachedSections(sections, extent), reference);
  if (!section) return { error: 'chapter_not_found_or_not_read_yet' };

  const start = Math.max(1, Math.floor(from));
  const rows = await paragraphsOf(await bookTextDriver(), book.id, section.index, start, PARAGRAPH_PAGE);
  const paragraphs: { n: number; text: string }[] = [];
  let spent = 0;
  let next: number | null = null;
  let atPosition = false;
  for (const row of rows) {
    const text = readablePart(extent, row.section, row.start, row.text);
    if (text === null) {
      atPosition = true;
      break;
    }
    if (paragraphs.length > 0 && spent + text.length > maxChars) {
      next = row.n;
      break;
    }
    paragraphs.push({ n: row.n, text: text.length > maxChars ? `${text.slice(0, maxChars)}…` : text });
    spent += text.length;
    if (text.length < row.text.length) {
      atPosition = true;
      break;
    }
  }
  if (next === null && !atPosition && rows.length === PARAGRAPH_PAGE) next = rows[rows.length - 1].n + 1;
  return { index: section.index, title: section.title, paragraphs, total: section.paragraphs, next, atPosition };
}
