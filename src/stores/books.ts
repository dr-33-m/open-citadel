import { eq } from "drizzle-orm";
import { create } from "zustand";
import { useShallow } from "zustand/shallow";

import { db } from "@/db/client";
import { appSettings, books } from "@/db/schema";
import { deleteBookWithFile } from "@/services/book-delete";
import { saveBookFinishedNote } from "@/services/journey";
import {
  OWNED_DIR,
  ensureOwnedDir,
  pickAndImportEpubs,
} from "@/services/book-import";
import {
  getActiveSyncJob,
  resumeRunningSyncIfAny,
  startOrResumeSync,
  type SyncJobView,
  type SyncPhase,
  type SyncStatus,
} from "@/services/sync-coordinator";

type Book = typeof books.$inferSelect;
export type BookStatus = "reading" | "queued" | "archived" | "favorite";

// ── Sync state shape ─────────────────────────────────────────────────────────

export type SyncState = {
  jobId: string | null;
  status: SyncStatus | "idle";
  phase: SyncPhase | null;
  /** Progress counters for the current phase */
  done: number;
  total: number;
  failedCount: number;
  updatedAt: string | null;
};

const IDLE_SYNC: SyncState = {
  jobId: null,
  status: "idle",
  phase: null,
  done: 0,
  total: 0,
  failedCount: 0,
  updatedAt: null,
};

function jobToSyncState(job: SyncJobView): SyncState {
  // Pick the most meaningful done/total for the current phase
  let done = 0;
  let total = 0;
  switch (job.phase) {
    case "scanning":
      done = job.scanDone;
      total = job.scanTotal;
      break;
    case "importing":
      done = job.importDone;
      total = job.importTotal;
      break;
    case "preparing":
      done = job.prepareDone;
      total = job.prepareTotal;
      break;
    case "finalizing":
      done = job.prepareDone;
      total = job.prepareTotal;
      break;
  }
  return {
    jobId: job.id,
    status: job.status,
    phase: job.phase,
    done,
    total,
    failedCount: job.failedCount,
    updatedAt: job.updatedAt,
  };
}

// ── Store ────────────────────────────────────────────────────────────────────

interface BooksState {
  books: Book[];
  booksDirectoryUri: string | null;
  isLoading: boolean;
  sync: SyncState;

  loadBooks: () => Promise<void>;
  loadDirectoryUri: () => Promise<void>;
  setDirectoryUri: (uri: string) => Promise<void>;
  /** iOS-only: ensure the owned library folder exists and is the scan root */
  initLibrary: () => Promise<void>;
  /** iOS-only: pick EPUBs, copy into the owned folder, then sync. Returns count. */
  importBooks: () => Promise<number>;
  /** Hydrate sync state from DB on app launch (restores progress banner) */
  hydrateSyncState: () => Promise<void>;
  /** Start a new sync or attach to an existing running one */
  syncBooks: () => Promise<void>;
  updateBookStatus: (
    bookId: string,
    status: BookStatus | null,
  ) => Promise<void>;
  /** Moves one or more queued books, as a contiguous block preserving the
   * given order, to a new position. Resequences the whole queue 0..n-1 each
   * call — queues are small, so this is simpler and just as correct as
   * fractional-index bookkeeping. Books that aren't currently queued are
   * silently skipped. */
  reorderQueue: (
    bookIds: string[],
    target: { position?: 'top' | 'bottom'; beforeId?: string; afterId?: string },
  ) => Promise<void>;
  clearQueue: () => Promise<void>;
  toggleFavorite: (bookId: string) => Promise<void>;
  updateBookMetadata: (
    bookId: string,
    metadata: {
      title?: string;
      author?: string;
      coverUrl?: string;
      totalPages?: number;
    },
  ) => Promise<void>;
  deleteBook: (bookId: string) => Promise<void>;
  updateBookTitle: (bookId: string, title: string) => Promise<void>;
}

/** How often to do a full loadBooks() during the preparing phase */
const LOAD_BOOKS_EVERY_N = 50;
let _preparedSinceLastLoad = 0;

export const useBooksStore = create<BooksState>((set, get) => ({
  books: [],
  booksDirectoryUri: null,
  isLoading: false,
  sync: IDLE_SYNC,

  loadBooks: async () => {
    set({ isLoading: true });
    const allBooks = await db.select().from(books);
    set({ books: allBooks, isLoading: false });
  },

  loadDirectoryUri: async () => {
    const result = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, "booksDirectoryUri"));
    if (result.length > 0) {
      set({ booksDirectoryUri: result[0].value });
    }
  },

  setDirectoryUri: async (uri: string) => {
    await db
      .insert(appSettings)
      .values({ key: "booksDirectoryUri", value: uri })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: uri },
      });
    set({ booksDirectoryUri: uri });
    await get().syncBooks();
  },

  initLibrary: async () => {
    // iOS-only: Android references EPUBs in place via SAF and never uses an
    // owned folder. On iOS we ensure the folder exists and make it the scan root.
    if (process.env.EXPO_OS !== "ios") return;
    await ensureOwnedDir();
    await db
      .insert(appSettings)
      .values({ key: "booksDirectoryUri", value: OWNED_DIR })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: OWNED_DIR },
      });
    set({ booksDirectoryUri: OWNED_DIR });
  },

  importBooks: async () => {
    const count = await pickAndImportEpubs();
    if (count > 0) {
      await get().initLibrary();
      await get().syncBooks();
    }
    return count;
  },

  /**
   * Called at app launch to restore sync progress from DB.
   * If a job was running when the app was killed, this restores the banner
   * and resumes the pipeline.
   */
  hydrateSyncState: async () => {
    const job = await getActiveSyncJob();
    if (!job) {
      set({ sync: IDLE_SYNC });
      return;
    }

    // Restore banner immediately
    set({ sync: jobToSyncState(job) });

    // Resume pipeline in background
    resumeRunningSyncIfAny((updatedJob) => {
      set({ sync: jobToSyncState(updatedJob) });

      // Refresh books list periodically during preparing phase
      if (updatedJob.phase === "preparing") {
        _preparedSinceLastLoad++;
        if (
          _preparedSinceLastLoad >= LOAD_BOOKS_EVERY_N ||
          updatedJob.prepareDone === updatedJob.prepareTotal
        ) {
          _preparedSinceLastLoad = 0;
          get().loadBooks();
        }
      }

      // Final refresh when done
      if (updatedJob.status === "completed" || updatedJob.status === "failed") {
        get().loadBooks();
        if (updatedJob.status === "completed") {
          setTimeout(() => set({ sync: IDLE_SYNC }), 2000);
        }
      }
    }).catch((e) => console.warn("[books-store] resume error", e));
  },

  syncBooks: async () => {
    const { booksDirectoryUri } = get();
    if (!booksDirectoryUri) return;

    // Don't start a second sync if one is already running
    if (get().sync.status === "running") return;

    _preparedSinceLastLoad = 0;

    await startOrResumeSync(booksDirectoryUri, (job) => {
      set({ sync: jobToSyncState(job) });

      // After importing phase: show books immediately
      if (job.phase === "importing" && job.importDone === job.importTotal) {
        get().loadBooks();
      }

      // During preparing: refresh every N books
      if (job.phase === "preparing") {
        _preparedSinceLastLoad++;
        if (
          _preparedSinceLastLoad >= LOAD_BOOKS_EVERY_N ||
          job.prepareDone === job.prepareTotal
        ) {
          _preparedSinceLastLoad = 0;
          get().loadBooks();
        }
      }

      // Final refresh
      if (job.status === "completed" || job.status === "failed") {
        get().loadBooks();
        if (job.status === "completed") {
          setTimeout(() => set({ sync: IDLE_SYNC }), 2000);
        }
      }
    });
  },

  updateBookStatus: async (bookId: string, status: BookStatus | null) => {
    const wasArchived =
      get().books.find((b) => b.id === bookId)?.status === "archived";
    const updates: Record<string, unknown> = { status };
    if (status === "archived") {
      updates.completedAt = new Date().toISOString();
    }
    if (status === "queued") {
      // Append to the end of the current queue. Stamped here (not in the
      // chat tool) so every caller — the UI button and Samwell's
      // add_to_queue tool alike — gets correct ordering for free.
      const currentlyQueued = get().books.filter((b) => b.status === "queued");
      const maxOrder = currentlyQueued.reduce(
        (max, b) => Math.max(max, b.queueOrder ?? -1),
        -1,
      );
      updates.queueOrder = maxOrder + 1;
    }
    await db.update(books).set(updates).where(eq(books.id, bookId));
    // Record a journey note the first time a book is finished.
    if (status === "archived" && !wasArchived) {
      try {
        saveBookFinishedNote(bookId);
      } catch {
        // Journey notes are best-effort; never block a status change.
      }
    }
    await get().loadBooks();
  },

  reorderQueue: async (bookIds, target) => {
    // Resolved as a block up front (not one bookId reorderQueue call per
    // book) so the given order is preserved exactly — moving books one at a
    // time against a shared anchor/position would telescope and reverse
    // their relative order on the second and later moves.
    const movingIds = new Set(bookIds);
    const moving = bookIds
      .map((id) => get().books.find((b) => b.id === id))
      .filter((b): b is Book => !!b && b.status === "queued");
    if (moving.length === 0) return;

    const rest = get()
      .books.filter((b) => b.status === "queued" && !movingIds.has(b.id))
      .sort((a, b) => {
        const orderA = a.queueOrder ?? Number.MAX_SAFE_INTEGER;
        const orderB = b.queueOrder ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        return a.addedAt.localeCompare(b.addedAt);
      });

    let insertAt = target.position === "bottom" ? rest.length : 0;
    if (target.afterId) {
      const idx = rest.findIndex((b) => b.id === target.afterId);
      if (idx >= 0) insertAt = idx + 1;
    } else if (target.beforeId) {
      const idx = rest.findIndex((b) => b.id === target.beforeId);
      if (idx >= 0) insertAt = idx;
    }

    const reordered = [...rest.slice(0, insertAt), ...moving, ...rest.slice(insertAt)];
    for (let i = 0; i < reordered.length; i++) {
      await db.update(books).set({ queueOrder: i }).where(eq(books.id, reordered[i].id));
    }
    await get().loadBooks();
  },

  clearQueue: async () => {
    await db
      .update(books)
      .set({ status: null })
      .where(eq(books.status, "queued"));
    await get().loadBooks();
  },

  toggleFavorite: async (bookId: string) => {
    const book = get().books.find((b) => b.id === bookId);
    if (!book) return;
    const newValue = book.isFavorite === 1 ? 0 : 1;
    await db
      .update(books)
      .set({ isFavorite: newValue })
      .where(eq(books.id, bookId));
    await get().loadBooks();
  },

  updateBookMetadata: async (bookId, metadata) => {
    await db.update(books).set(metadata).where(eq(books.id, bookId));
    await get().loadBooks();
  },

  deleteBook: async (bookId) => {
    await deleteBookWithFile(bookId);
    await get().loadBooks();
  },

  updateBookTitle: async (bookId, title) => {
    await db
      .update(books)
      .set({ title, titleLocked: 1 })
      .where(eq(books.id, bookId));
    await get().loadBooks();
  },
}));

// ── Selectors ────────────────────────────────────────────────────────────────

export const useCurrentlyReading = () =>
  useBooksStore(
    useShallow((s) => s.books.filter((b) => b.status === "reading")),
  );
export const useQueuedBooks = () =>
  useBooksStore(
    useShallow((s) =>
      s.books
        .filter((b) => b.status === "queued")
        .sort((a, b) => {
          const orderA = a.queueOrder ?? Number.MAX_SAFE_INTEGER;
          const orderB = b.queueOrder ?? Number.MAX_SAFE_INTEGER;
          if (orderA !== orderB) return orderA - orderB;
          return a.addedAt.localeCompare(b.addedAt);
        }),
    ),
  );
export const useArchivedBooks = () =>
  useBooksStore(
    useShallow((s) => s.books.filter((b) => b.status === "archived")),
  );
export const useFavoriteBooks = () =>
  useBooksStore(useShallow((s) => s.books.filter((b) => b.isFavorite === 1)));
export const useAllBooks = () => useBooksStore(useShallow((s) => s.books));
export const useSyncState = () => useBooksStore((s) => s.sync);
