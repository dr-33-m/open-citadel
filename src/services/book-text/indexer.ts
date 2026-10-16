import { getInfoAsync } from 'expo-file-system/legacy';

import { bookUri } from '@/services/book-text/archive';
import { bookTextDriver } from '@/services/book-text/driver';
import { extractBookText } from '@/services/book-text/extract';
import { forgetBook, indexedFingerprint, writeBook } from '@/services/book-text/store';

/** What the indexer needs to know about a book. */
export interface IndexableBook {
  id: string;
  filePath: string | null;
}

/** A file's size and time, which change whenever the file does. Null when it cannot be found. */
async function fingerprintOf(filePath: string): Promise<string | null> {
  const info = await getInfoAsync(bookUri(filePath)).catch(() => null);
  if (!info?.exists) return null;
  const { size, modificationTime } = info as { size?: number; modificationTime?: number };
  return `${size ?? 0}|${modificationTime ?? 0}`;
}

/** One book is read and written at a time, whoever asks: two at once only doubles the work on the JS thread. */
let line: Promise<unknown> = Promise.resolve();
const pending = new Map<string, Promise<boolean>>();

/**
 * Makes sure a book's text is in the index and current, reading it if it is
 * not. Resolves true when the index holds the book, false when its file
 * cannot be read or parsed (the reason is logged; the caller just leaves the
 * book out). A second call for a book already on its way shares the first.
 */
export function ensureIndexed(book: IndexableBook): Promise<boolean> {
  const filePath = book.filePath;
  if (!filePath) return Promise.resolve(false);
  const waiting = pending.get(book.id);
  if (waiting) return waiting;

  const job = (async () => {
    const driver = await bookTextDriver();
    const fingerprint = await fingerprintOf(filePath);
    if (!fingerprint) return false;
    if ((await indexedFingerprint(driver, book.id)) === fingerprint) return true;
    const run = line.then(async () => {
      const started = Date.now();
      const sections = await extractBookText(filePath);
      const read = Date.now();
      await writeBook(driver, book.id, fingerprint, sections, new Date().toISOString());
      if (__DEV__) console.log(`[book-text] indexed ${book.id}: read ${read - started}ms, written ${Date.now() - read}ms`);
    });
    line = run.catch(() => undefined);
    await run;
    return true;
  })()
    .catch((e) => {
      console.warn('[book-text] could not index', book.id, e);
      return false;
    })
    .finally(() => pending.delete(book.id));
  pending.set(book.id, job);
  return job;
}

/**
 * Takes a book out of the index, in line behind any write in progress (two
 * transactions on one connection would nest). Never throws: the index is a
 * cache.
 */
export async function forgetIndexedBook(bookId: string): Promise<void> {
  const run = line.then(async () => forgetBook(await bookTextDriver(), bookId));
  line = run.catch(() => undefined);
  try {
    await run;
  } catch (e) {
    console.warn('[book-text] could not forget', bookId, e);
  }
}

/** Between books in the background, so the app keeps its frames while the index fills. */
const PAUSE_MS = 400;
let warming = false;

/**
 * Indexes these books one after another, in the background, with a pause
 * between each: so the first time Samwell searches them, he searches at once.
 * A warm already running lets the new list wait for the next one rather than
 * starting a second.
 */
export async function warmIndex(books: readonly IndexableBook[]): Promise<void> {
  if (warming) return;
  warming = true;
  try {
    for (const book of books) {
      await ensureIndexed(book);
      await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    }
  } finally {
    warming = false;
  }
}
