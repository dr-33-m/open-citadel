import type { Link, Locator } from "@dr33m/react-native-readium";
import { eq } from "drizzle-orm";
import { create } from "zustand";

import { db } from "@/db/client";
import {
    bookmarks,
    books,
    highlights,
    notes,
    readingProgress,
    thoughts,
} from "@/db/schema";
import { extractSurroundingText } from "@/services/book-context";
import {
  addHighlightNote,
  deleteHighlight as removeHighlight,
  deleteHighlightNote,
  insertHighlight,
  updateHighlight as writeHighlight,
  updateHighlightNote,
} from "@/services/highlights";
import { repairSuggestedHighlights as moveSuggestedHighlights } from "@/services/book-text/repair-suggested-highlights";
import { finishRead, saveReadingPosition } from "@/services/reading-position";
import { useBooksStore } from "@/stores/books";
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
  /** Moves highlights Samwell suggested the old way to their passage. Run once the book is on screen. */
  repairSuggestedHighlights: (bookId: string) => Promise<void>;
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
  /** The new note's id, or null when the highlight no longer exists. */
  addNote: (highlightId: string, text: string) => Promise<string | null>;
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

  repairSuggestedHighlights: async (bookId: string) => {
    // Highlights Samwell suggested before suggestions found their passage
    // were saved at the reader's position, and never drawn. Moved to their
    // passage, and redrawn if this book is still open.
    try {
      if (!(await moveSuggestedHighlights(bookId)) || get().currentBook?.id !== bookId) return;
      const repaired = await db.select().from(highlights).where(eq(highlights.bookId, bookId));
      if (get().currentBook?.id === bookId) set({ highlights: repaired });
    } catch {
      // Best-effort: they stay where they were, as they always have.
    }
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
      saveReadingPosition(book.id, locator, progress);
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
    // The note belongs to the highlight's book, which is not necessarily the
    // one open in the reader, or any book at all: Samwell writes notes from a
    // chat. Taking the book from the reader dropped every note written while
    // none was open, and said nothing.
    const owner = db
      .select({ bookId: highlights.bookId })
      .from(highlights)
      .where(eq(highlights.id, highlightId))
      .get();
    if (!owner) return null;

    const noteRow = await addHighlightNote(highlightId, owner.bookId, text);

    const { currentBook, highlightNotes } = get();
    if (currentBook?.id === owner.bookId) {
      const existing = highlightNotes[highlightId] ?? [];
      set({
        highlightNotes: {
          ...highlightNotes,
          [highlightId]: [...existing, noteRow],
        },
      });
    }
    return noteRow.id;
  },

  updateNote: async (noteId: string, highlightId: string, text: string) => {
    const now = await updateHighlightNote(noteId, text);

    const { highlightNotes } = get();
    const existing = highlightNotes[highlightId];
    if (!existing) return;
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
    const existing = highlightNotes[highlightId];
    if (!existing) return;
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
        saveReadingPosition(currentBook.id, currentLocator, progress);
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
