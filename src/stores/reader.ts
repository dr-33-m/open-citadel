import type { Link, Locator } from "@dr33m/react-native-readium";
import { eq } from "drizzle-orm";
import { create } from "zustand";

import { db } from "@/db/client";
import {
    bookmarks,
    books,
    highlights,
    notes,
    readingDays,
    readingProgress,
    thoughts,
} from "@/db/schema";
import { invalidateBlogLibrary } from "@/query-manager/blogs/invalidate";
import { finishArticleOfBook } from "@/services/blogs/articles";
import { extractSurroundingText } from "@/services/book-context";
import {
  addHighlightNote,
  deleteHighlight as removeHighlight,
  deleteHighlightNote,
  insertHighlight,
  updateHighlight as writeHighlight,
  updateHighlightNote,
} from "@/services/highlights";
import { countableProgress } from "@/services/reading-day";
import { useBooksStore } from "@/stores/books";
import { localDayString } from "@/utils/day";
import { fractionToSave, isReadThrough, learnPageStep, readFraction } from "@/utils/read-progress";

type Book = typeof books.$inferSelect;
type Bookmark = typeof bookmarks.$inferSelect;
type Highlight = typeof highlights.$inferSelect;
type Note = typeof notes.$inferSelect;

interface ReaderState {
  currentBook: Book | null;
  currentLocator: Locator | null;
  savedLocator: Locator | null;
  /** The fraction that was saved with `savedLocator`, when the book was opened. */
  savedFraction: number | null;
  /** The fraction read at `currentLocator`, 0 to 1. See `utils/read-progress`. */
  progress: number | null;
  /** What share of the file on screen one page is, once a page has been turned. */
  pageStep: number | null;
  /** The publication's last file, where its end is. Known once it has opened. */
  lastFile: string | null;
  bookmarkList: Bookmark[];
  highlights: Highlight[];
  highlightNotes: Record<string, Note[]>; // highlightId -> notes[]
  allTags: string[]; // unique tags across all books AND thoughts, for suggestions
  tableOfContents: Link[];
  isLoading: boolean;

  openBook: (bookId: string) => Promise<void>;
  updateProgress: (locator: Locator) => void;
  addBookmark: () => Promise<void>;
  removeBookmark: (id: string) => Promise<void>;
  updateBookmarkNote: (id: string, note: string) => Promise<void>;
  addHighlight: (
    text: string,
    locator: Locator,
    color?: string,
    chatSessionId?: string,
    /** Explicit book to attach to, when called outside the reader (falls back to currentBook). */
    bookIdOverride?: string,
  ) => Promise<string>;
  updateHighlight: (
    id: string,
    updates: { color?: string; tags?: string; chatSessionId?: string },
  ) => Promise<void>;
  deleteHighlight: (id: string) => Promise<void>;
  addNote: (highlightId: string, text: string) => Promise<void>;
  updateNote: (
    noteId: string,
    highlightId: string,
    text: string,
  ) => Promise<void>;
  deleteNote: (noteId: string, highlightId: string) => Promise<void>;
  setTableOfContents: (toc: Link[]) => void;
  setLastFile: (href: string | null) => void;
  closeBook: () => void;
}

let progressTimeout: ReturnType<typeof setTimeout> | null = null;

export async function fetchAllTags(): Promise<string[]> {
  const highlightRows = await db
    .select({ tags: highlights.tags })
    .from(highlights);
  const thoughtRows = await db.select({ tags: thoughts.tags }).from(thoughts);
  const unique = new Set<string>();
  for (const { tags } of [...highlightRows, ...thoughtRows]) {
    if (tags) {
      try {
        for (const t of JSON.parse(tags) as string[]) unique.add(t);
      } catch {}
    }
  }
  return Array.from(unique).sort();
}

/** Accumulate the day's reading for this book. What counts as reading (and
 * what is just navigation) lives in `services/reading-day`. */
async function recordReadingDay(bookId: string, previousPct: number, nextPct: number) {
  const delta = countableProgress(previousPct, nextPct);
  if (delta === 0) return;

  const day = localDayString();
  const id = `${day}:${bookId}`;
  const now = new Date().toISOString();

  const [row] = await db.select().from(readingDays).where(eq(readingDays.id, id));
  if (row) {
    await db
      .update(readingDays)
      .set({ progressDelta: row.progressDelta + delta, updatedAt: now })
      .where(eq(readingDays.id, id));
  } else {
    await db.insert(readingDays).values({ id, day, bookId, progressDelta: delta, updatedAt: now });
  }
}

async function saveProgressToDb(bookId: string, locator: Locator, percentage: number) {
  const now = new Date().toISOString();
  const locatorJson = JSON.stringify(locator);

  const [existing] = await db
    .select()
    .from(readingProgress)
    .where(eq(readingProgress.bookId, bookId));

  if (existing) {
    await db
      .update(readingProgress)
      .set({ percentage, locator: locatorJson, updatedAt: now })
      .where(eq(readingProgress.id, existing.id));
  } else {
    await db.insert(readingProgress).values({
      id: `rp-${bookId}`,
      bookId,
      currentPage: 0,
      percentage,
      locator: locatorJson,
      updatedAt: now,
    });
  }

  /*
   * The row is written, so the Library can be told what it says.
   *
   * After the await, never before it, and pushed rather than left to be
   * discovered. The card used to query for this row itself when the Library
   * regained focus, which raced `closeBook`: that write is fired without being
   * awaited, because closing a screen cannot wait on a database, and the read
   * usually won. The bar showed the position from the previous visit and only
   * caught up on the next one, which is exactly how it was reported.
   */
  useBooksStore.getState().setBookProgress(bookId, percentage, now);

  // First-ever write for a book has no previous position to compare against,
  // so it contributes nothing — opening a book isn't reading it.
  await recordReadingDay(bookId, existing?.percentage ?? percentage, percentage);
}

/**
 * A book or a post the reader was left at the end of becomes finished: a book
 * moves to Have Read as "Mark as Finished" would move it, a post to the blogs'
 * Have Read. Nothing is said about it, since it happens on the way out and the
 * shelf it lands on is the answer. One already finished is left alone, so the
 * day it was finished stays the first one.
 *
 * It used to take the menu, which nobody thinks to open for something they
 * have just read: finished posts stayed out of Have Read, and could not be
 * found there.
 */
async function finishRead(book: Book): Promise<void> {
  // A transcript is read alongside listening, and an episode is finished by
  // listening to it, never by reading its transcript to the end.
  if (book.kind === "episode") return;
  if (book.kind === "article") {
    if (await finishArticleOfBook(book.id)) invalidateBlogLibrary();
    return;
  }
  if (book.status !== "archived") await useBooksStore.getState().updateBookStatus(book.id, "archived");
}

export const useReaderStore = create<ReaderState>((set, get) => ({
  currentBook: null,
  currentLocator: null,
  savedLocator: null,
  savedFraction: null,
  progress: null,
  pageStep: null,
  lastFile: null,
  bookmarkList: [],
  highlights: [],
  highlightNotes: {},
  allTags: [],
  tableOfContents: [],
  isLoading: false,

  openBook: async (bookId: string) => {
    set({ isLoading: true });

    const [book] = await db.select().from(books).where(eq(books.id, bookId));
    if (!book) {
      set({ isLoading: false });
      return;
    }

    // Load saved reading position
    const [progress] = await db
      .select()
      .from(readingProgress)
      .where(eq(readingProgress.bookId, bookId));

    const savedLocator = progress?.locator
      ? (JSON.parse(progress.locator) as Locator)
      : null;

    // Load bookmarks for this book
    const bookBookmarks = await db
      .select()
      .from(bookmarks)
      .where(eq(bookmarks.bookId, bookId));

    // Load highlights and notes for this book
    const bookHighlights = await db
      .select()
      .from(highlights)
      .where(eq(highlights.bookId, bookId));

    const bookNotes = await db
      .select()
      .from(notes)
      .where(eq(notes.bookId, bookId));

    const notesMap: Record<string, Note[]> = {};
    for (const note of bookNotes) {
      if (note.highlightId) {
        if (!notesMap[note.highlightId]) notesMap[note.highlightId] = [];
        notesMap[note.highlightId].push(note);
      }
    }

    // Only auto-move to reading from queued or null — never touch archived
    // books. Never a blog post either: it is read in a sitting, and "currently
    // reading" (the shelf, Samwell's picture of the reader) means books.
    let effectiveBook = book;
    if (book.kind === "book" && (book.status === "queued" || !book.status)) {
      await db
        .update(books)
        .set({ status: "reading" })
        .where(eq(books.id, bookId));
      effectiveBook = { ...book, status: "reading" };
      useBooksStore.getState().loadBooks();
    }

    const allTagsList = await fetchAllTags();

    set({
      currentBook: effectiveBook,
      savedLocator,
      savedFraction: progress?.percentage ?? null,
      progress: null,
      pageStep: null,
      lastFile: null,
      bookmarkList: bookBookmarks,
      highlights: bookHighlights,
      highlightNotes: notesMap,
      allTags: allTagsList,
      isLoading: false,
    });
  },

  updateProgress: (locator: Locator) => {
    const { currentBook, currentLocator, savedLocator, savedFraction } = get();
    // A blog post is one file, and the page on screen counts as read in it.
    const pageStep = learnPageStep(get().pageStep, currentLocator, locator);
    const fraction = readFraction(locator, {
      oneFile: currentBook?.kind === "article",
      pageStep,
      lastFile: locator.href === get().lastFile,
    });
    const progress = fractionToSave(
      fraction,
      locator,
      pageStep,
      savedFraction === null ? null : { fraction: savedFraction, spot: savedLocator },
    );
    set({ currentLocator: locator, pageStep, progress });

    // Debounce DB writes — 2 seconds
    if (progressTimeout) clearTimeout(progressTimeout);
    progressTimeout = setTimeout(() => {
      const { currentBook: book } = get();
      if (!book) return;
      saveProgressToDb(book.id, locator, progress);
    }, 2000);
  },

  addBookmark: async () => {
    const { currentBook, currentLocator, bookmarkList, tableOfContents } =
      get();
    if (!currentBook || !currentLocator) return;

    // Prevent duplicate bookmarks for the exact same page (same href + position)
    const alreadyExists = bookmarkList.some((bm) => {
      try {
        const loc = JSON.parse(bm.locator) as Locator;
        return (
          loc.href === currentLocator.href &&
          loc.locations?.position === currentLocator.locations?.position
        );
      } catch {
        return false;
      }
    });
    if (alreadyExists) return;

    const id = `bm-${Date.now()}`;
    const now = new Date().toISOString();
    const chapter =
      tableOfContents.find((l) =>
        currentLocator.href.includes(l.href.split("#")[0]),
      )?.title ?? null;

    await db.insert(bookmarks).values({
      id,
      bookId: currentBook.id,
      locator: JSON.stringify(currentLocator),
      page: currentLocator.locations?.position ?? null,
      chapter,
      createdAt: now,
    });

    const updated = await db
      .select()
      .from(bookmarks)
      .where(eq(bookmarks.bookId, currentBook.id));
    set({ bookmarkList: updated });
  },

  removeBookmark: async (id: string) => {
    await db.delete(bookmarks).where(eq(bookmarks.id, id));

    const { currentBook } = get();
    if (!currentBook) return;

    const updated = await db
      .select()
      .from(bookmarks)
      .where(eq(bookmarks.bookId, currentBook.id));
    set({ bookmarkList: updated });
  },

  updateBookmarkNote: async (id: string, note: string) => {
    await db.update(bookmarks).set({ note }).where(eq(bookmarks.id, id));

    const { bookmarkList } = get();
    set({
      bookmarkList: bookmarkList.map((bm) =>
        bm.id === id ? { ...bm, note } : bm,
      ),
    });
  },

  addHighlight: async (
    text: string,
    locator: Locator,
    color?: string,
    chatSessionId?: string,
    bookIdOverride?: string,
  ) => {
    const { currentBook } = get();
    const bookId = bookIdOverride ?? currentBook?.id;
    if (!bookId) return "";

    const id = await insertHighlight({ bookId, text, locator, color, chatSessionId });

    // Capture the surrounding chapter text in the background so the highlight
    // keeps the progression it was lifted from (chats, tags, Compass context).
    const filePath =
      currentBook?.id === bookId
        ? currentBook.filePath
        : db.select({ filePath: books.filePath }).from(books).where(eq(books.id, bookId)).get()
            ?.filePath;
    if (filePath) {
      void extractSurroundingText(filePath, locator)
        .then((surrounding) =>
          db
            .update(highlights)
            .set({ context: JSON.stringify(surrounding) })
            .where(eq(highlights.id, id)),
        )
        .catch(() => {
          // Best-effort: a highlight without context is still a highlight.
        });
    }

    // Only refresh the reader's own highlight list when it's for the book
    // currently open there — a suggestion approved from chat may target a
    // different book entirely.
    if (currentBook?.id === bookId) {
      const bookHighlights = await db.select().from(highlights).where(eq(highlights.bookId, bookId));
      set({ highlights: bookHighlights });
    }

    return id;
  },

  updateHighlight: async (
    id: string,
    updates: { color?: string; tags?: string; chatSessionId?: string },
  ) => {
    // The write itself doesn't need currentBook — only refreshing this
    // store's own highlight list afterward does. Gating the write on it too
    // silently dropped updates whenever called from outside the reader.
    await writeHighlight(id, updates);

    const { currentBook } = get();
    if (currentBook) {
      const bookHighlights = await db
        .select()
        .from(highlights)
        .where(eq(highlights.bookId, currentBook.id));

      const allTagsList =
        "tags" in updates ? await fetchAllTags() : get().allTags;

      set({ highlights: bookHighlights, allTags: allTagsList });
    }
  },

  deleteHighlight: async (id: string) => {
    await removeHighlight(id);

    const { currentBook } = get();
    if (!currentBook) return;

    const bookHighlights = await db
      .select()
      .from(highlights)
      .where(eq(highlights.bookId, currentBook.id));

    set({ highlights: bookHighlights });
  },

  addNote: async (highlightId: string, text: string) => {
    const { currentBook } = get();
    if (!currentBook) return;
    const noteRow = await addHighlightNote(highlightId, currentBook.id, text);
    const { highlightNotes } = get();
    const existing = highlightNotes[highlightId] ?? [];
    set({
      highlightNotes: {
        ...highlightNotes,
        [highlightId]: [...existing, noteRow],
      },
    });
  },

  updateNote: async (noteId: string, highlightId: string, text: string) => {
    const now = await updateHighlightNote(noteId, text);

    const { highlightNotes } = get();
    const existing = highlightNotes[highlightId] ?? [];
    set({
      highlightNotes: {
        ...highlightNotes,
        [highlightId]: existing.map((n) =>
          n.id === noteId ? { ...n, text, updatedAt: now } : n,
        ),
      },
    });
  },

  deleteNote: async (noteId: string, highlightId: string) => {
    await deleteHighlightNote(noteId);

    const { highlightNotes } = get();
    const existing = highlightNotes[highlightId] ?? [];
    set({
      highlightNotes: {
        ...highlightNotes,
        [highlightId]: existing.filter((n) => n.id !== noteId),
      },
    });
  },

  setTableOfContents: (toc: Link[]) => {
    set({ tableOfContents: toc });
  },

  setLastFile: (href: string | null) => {
    set({ lastFile: href });
  },

  closeBook: () => {
    // Left at the end: it is finished, without having to be told so.
    const closing = get();
    if (closing.currentBook && isReadThrough(closing.progress)) void finishRead(closing.currentBook);

    // Flush any pending debounced progress write immediately
    if (progressTimeout) {
      clearTimeout(progressTimeout);
      progressTimeout = null;
      const { currentBook, currentLocator, progress } = get();
      if (currentBook && currentLocator && progress !== null) {
        saveProgressToDb(currentBook.id, currentLocator, progress);
      }
    }
    set({
      currentBook: null,
      currentLocator: null,
      savedLocator: null,
      savedFraction: null,
      progress: null,
      pageStep: null,
      lastFile: null,
      bookmarkList: [],
      highlights: [],
      highlightNotes: {},
      allTags: [],
      tableOfContents: [],
    });
  },
}));
