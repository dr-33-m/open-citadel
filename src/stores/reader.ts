import { create } from 'zustand';
import { eq } from 'drizzle-orm';
import type { Locator, Link } from 'react-native-readium';

import { db } from '@/db/client';
import { books, highlights, notes, readingProgress } from '@/db/schema';
import { useBooksStore } from '@/stores/books';

type Book = typeof books.$inferSelect;
type Highlight = typeof highlights.$inferSelect;
type Note = typeof notes.$inferSelect;

interface ReaderState {
  currentBook: Book | null;
  currentLocator: Locator | null;
  savedLocator: Locator | null;
  highlights: Highlight[];
  highlightNotes: Record<string, Note[]>; // highlightId -> notes[]
  allTags: string[]; // unique tags across all books, for suggestions
  tableOfContents: Link[];
  isLoading: boolean;

  openBook: (bookId: string) => Promise<void>;
  updateProgress: (locator: Locator) => void;
  addHighlight: (text: string, locator: Locator, color?: string) => Promise<void>;
  updateHighlight: (id: string, updates: { color?: string; tags?: string }) => Promise<void>;
  deleteHighlight: (id: string) => Promise<void>;
  addNote: (highlightId: string, text: string) => Promise<void>;
  updateNote: (noteId: string, highlightId: string, text: string) => Promise<void>;
  deleteNote: (noteId: string, highlightId: string) => Promise<void>;
  setTableOfContents: (toc: Link[]) => void;
  closeBook: () => void;
}

let progressTimeout: ReturnType<typeof setTimeout> | null = null;

async function fetchAllTags(): Promise<string[]> {
  const rows = await db.select({ tags: highlights.tags }).from(highlights);
  const unique = new Set<string>();
  for (const { tags } of rows) {
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
    if (book.status === 'queued' || !book.status) {
      await db
        .update(books)
        .set({ status: 'reading' })
        .where(eq(books.id, bookId));
      effectiveBook = { ...book, status: 'reading' };
      useBooksStore.getState().loadBooks();
    }

    const allTagsList = await fetchAllTags();

    set({
      currentBook: effectiveBook,
      savedLocator,
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

  addHighlight: async (text: string, locator: Locator, color?: string) => {
    const { currentBook } = get();
    if (!currentBook) return;

    const id = `hl-${Date.now()}`;
    const now = new Date().toISOString();

    await db.insert(highlights).values({
      id,
      bookId: currentBook.id,
      text,
      locator: JSON.stringify(locator),
      color: color || '#f2ca50',
      createdAt: now,
    });

    const bookHighlights = await db
      .select()
      .from(highlights)
      .where(eq(highlights.bookId, currentBook.id));

    set({ highlights: bookHighlights });
  },

  updateHighlight: async (id: string, updates: { color?: string; tags?: string }) => {
    const { currentBook } = get();
    if (!currentBook) return;

    await db.update(highlights).set(updates).where(eq(highlights.id, id));

    const bookHighlights = await db
      .select()
      .from(highlights)
      .where(eq(highlights.bookId, currentBook.id));

    const allTagsList = 'tags' in updates ? await fetchAllTags() : get().allTags;

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
    const noteRow = { id, highlightId, bookId: currentBook.id, text, createdAt: now };

    await db.insert(notes).values(noteRow);

    const existing = highlightNotes[highlightId] ?? [];
    set({
      highlightNotes: { ...highlightNotes, [highlightId]: [...existing, noteRow] },
    });
  },

  updateNote: async (noteId: string, highlightId: string, text: string) => {
    await db.update(notes).set({ text }).where(eq(notes.id, noteId));

    const { highlightNotes } = get();
    const existing = highlightNotes[highlightId] ?? [];
    set({
      highlightNotes: {
        ...highlightNotes,
        [highlightId]: existing.map((n) => (n.id === noteId ? { ...n, text } : n)),
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
      highlights: [],
      highlightNotes: {},
      allTags: [],
      tableOfContents: [],
    });
  },
}));
