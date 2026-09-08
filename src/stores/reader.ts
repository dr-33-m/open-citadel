import { eq } from "drizzle-orm";
import type { Link, Locator } from "@dr33m/react-native-readium";
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
import { extractSurroundingText } from "@/services/book-context";
import { countableProgress } from "@/services/reading-day";
import { useBooksStore } from "@/stores/books";
import { localDayString } from "@/utils/day";

type Book = typeof books.$inferSelect;
type Bookmark = typeof bookmarks.$inferSelect;
type Highlight = typeof highlights.$inferSelect;
type Note = typeof notes.$inferSelect;

interface ReaderState {
  currentBook: Book | null;
  currentLocator: Locator | null;
  savedLocator: Locator | null;
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

async function saveProgressToDb(bookId: string, locator: Locator) {
  const percentage = locator.locations?.totalProgression ?? 0;
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
  useBooksStore.getState().setBookProgress(bookId, percentage);

  // First-ever write for a book has no previous position to compare against,
  // so it contributes nothing — opening a book isn't reading it.
  await recordReadingDay(bookId, existing?.percentage ?? percentage, percentage);
}

export const useReaderStore = create<ReaderState>((set, get) => ({
  currentBook: null,
  currentLocator: null,
  savedLocator: null,
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

    // Only auto-move to reading from queued or null — never touch archived books
    let effectiveBook = book;
    if (book.status === "queued" || !book.status) {
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
      bookmarkList: bookBookmarks,
      highlights: bookHighlights,
      highlightNotes: notesMap,
      allTags: allTagsList,
      isLoading: false,
    });
  },

  updateProgress: (locator: Locator) => {
    set({ currentLocator: locator });

    // Debounce DB writes — 2 seconds
    if (progressTimeout) clearTimeout(progressTimeout);
    progressTimeout = setTimeout(() => {
      const { currentBook } = get();
      if (!currentBook) return;
      saveProgressToDb(currentBook.id, locator);
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

    // A random suffix alongside the timestamp avoids id collisions when two
    // highlights are created within the same millisecond.
    const id = `hl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    await db.insert(highlights).values({
      id,
      bookId,
      text,
      locator: JSON.stringify(locator),
      color: color || "#f2ca50",
      chatSessionId: chatSessionId ?? null,
      createdAt: now,
    });

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
    await db.update(highlights).set(updates).where(eq(highlights.id, id));

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
    // Delete associated notes first
    await db.delete(notes).where(eq(notes.highlightId, id));
    await db.delete(highlights).where(eq(highlights.id, id));

    const { currentBook } = get();
    if (!currentBook) return;

    const bookHighlights = await db
      .select()
      .from(highlights)
      .where(eq(highlights.bookId, currentBook.id));

    set({ highlights: bookHighlights });
  },

  addNote: async (highlightId: string, text: string) => {
    const { currentBook, highlightNotes } = get();
    if (!currentBook) return;

    const id = `note-${Date.now()}`;
    const now = new Date().toISOString();
    const noteRow: Note = {
      id,
      highlightId,
      bookId: currentBook.id,
      text,
      createdAt: now,
      updatedAt: null,
    };

    await db.insert(notes).values(noteRow);

    const existing = highlightNotes[highlightId] ?? [];
    set({
      highlightNotes: {
        ...highlightNotes,
        [highlightId]: [...existing, noteRow],
      },
    });
  },

  updateNote: async (noteId: string, highlightId: string, text: string) => {
    const now = new Date().toISOString();
    await db
      .update(notes)
      .set({ text, updatedAt: now })
      .where(eq(notes.id, noteId));

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
    await db.delete(notes).where(eq(notes.id, noteId));

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

  closeBook: () => {
    // Flush any pending debounced progress write immediately
    if (progressTimeout) {
      clearTimeout(progressTimeout);
      progressTimeout = null;
      const { currentBook, currentLocator } = get();
      if (currentBook && currentLocator) {
        saveProgressToDb(currentBook.id, currentLocator);
      }
    }
    set({
      currentBook: null,
      currentLocator: null,
      savedLocator: null,
      bookmarkList: [],
      highlights: [],
      highlightNotes: {},
      allTags: [],
      tableOfContents: [],
    });
  },
}));
