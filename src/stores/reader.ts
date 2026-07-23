import { eq } from "drizzle-orm";
import type { Link, Locator } from "@dr33m/react-native-readium";
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
import { useBooksStore } from "@/stores/books";

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
  ) => {
    const { currentBook } = get();
    if (!currentBook) return "";

    const id = `hl-${Date.now()}`;
    const now = new Date().toISOString();

    await db.insert(highlights).values({
      id,
      bookId: currentBook.id,
      text,
      locator: JSON.stringify(locator),
      color: color || "#f2ca50",
      chatSessionId: chatSessionId ?? null,
      createdAt: now,
    });

    // Capture the surrounding chapter text in the background so the highlight
    // keeps the progression it was lifted from (chats, tags, Compass context).
    if (currentBook.filePath) {
      const filePath = currentBook.filePath;
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

    const bookHighlights = await db
      .select()
      .from(highlights)
      .where(eq(highlights.bookId, currentBook.id));

    set({ highlights: bookHighlights });
    return id;
  },

  updateHighlight: async (
    id: string,
    updates: { color?: string; tags?: string; chatSessionId?: string },
  ) => {
    const { currentBook } = get();
    if (!currentBook) return;

    await db.update(highlights).set(updates).where(eq(highlights.id, id));

    const bookHighlights = await db
      .select()
      .from(highlights)
      .where(eq(highlights.bookId, currentBook.id));

    const allTagsList =
      "tags" in updates ? await fetchAllTags() : get().allTags;

    set({ highlights: bookHighlights, allTags: allTagsList });
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
