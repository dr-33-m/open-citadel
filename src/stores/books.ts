import { eq } from "drizzle-orm";
import { create } from "zustand";
import { useShallow } from "zustand/shallow";

import { showToast } from "@/components/toast/toast-provider";
import { db } from "@/db/client";
import { appSettings, books } from "@/db/schema";
import { deleteBookWithFile } from "@/services/book-delete";
import { saveBookFinishedNote } from "@/services/journey";
import {
  OWNED_DIR,
  ensureOwnedDir,
  pickAndImportEpubs,
} from "@/services/book-import";
import type { ToastOptions } from "@/components/toast/types";
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

/**
 * The name the scan notice runs under.
 *
 * One key for every scan in the app, so a launch scan and a pull that overlap
 * write to one toast instead of arguing in a pile of two.
 */
const SCAN_TOAST = "library-scan";

/**
 * What the scan found, in one line.
 *
 * Kept here beside `jobToSyncState` rather than in the pipeline, because it is
 * a copy decision and the pipeline deals in counters. The counters it reads
 * are the two the pipeline had to be taught: `importDone` counts every file it
 * walked past and `failedCount` only counts what broke on this run, so neither
 * on its own answers "what happened".
 *
 * Books that could not be read are reported as SKIPPED and not as an error.
 * There is nothing to do about them in the app — the file does not open — and
 * the answer is to take it out of the folder, so the notice says what happened
 * and gets out of the way rather than offering a retry nobody wants.
 */
function scanResultToast(job: SyncJobView): ToastOptions {
  if (job.status === "failed") {
    return { message: "Could not check your folder" };
  }
  // A file that gave up this run is remembered from now on, so to the reader
  // it is the same thing as one that was passed over: it did not get in.
  const missed = job.skippedCount + job.failedCount;
  const missedNote = missed > 0 ? `, skipped ${missed} that will not open` : "";

  if (job.addedCount === 0) {
    return { message: `No new books${missedNote}` };
  }
  const noun = job.addedCount === 1 ? "book" : "books";
  return {
    message: `Added ${job.addedCount} ${noun}${missedNote}`,
    tone: "success",
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
  setDirectoryUri: (uri: string, options?: { scan?: boolean }) => Promise<void>;
  /** iOS-only: ensure the owned library folder exists and is the scan root */
  initLibrary: () => Promise<void>;
  /** iOS-only: pick EPUBs, copy into the owned folder, then sync. Returns count. */
  importBooks: () => Promise<number>;
  /** Hydrate sync state from DB on app launch (restores progress banner) */
  hydrateSyncState: () => Promise<void>;
  /**
   * Start a new sync or attach to an existing running one.
   *
   * `notify` raises a toast with what the scan FOUND, once it is over. Only
   * the result: while it runs, the Library's own indicator is already saying
   * "SCANNING 4/10" a few points below where the toast would land, and two
   * things narrating one scan is one thing too many.
   *
   * For the two scans nobody asked for out loud — the one at launch, and the
   * one a pull starts — where without it a scan that finds nothing is
   * indistinguishable from a scan that never ran. The sync that follows
   * picking a folder says nothing, because the books arriving IS the answer.
   */
  syncBooks: (options?: { notify?: boolean }) => Promise<void>;
  /**
   * The one look at the folder taken when the app opens.
   *
   * Loads the scan root itself rather than trusting a caller to have done it,
   * so "the app opened" is the only thing it needs to be true. Does nothing
   * when there is no folder yet (the empty state is already saying so) or when
   * a job interrupted by the last app kill is still finishing, which is
   * already narrating itself.
   */
  scanOnLaunch: () => Promise<void>;
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

/**
 * What the UI does with one report of a scan's progress.
 *
 * ONE copy. There were two — the scan a caller starts and the scan resumed at
 * launch each had their own — and they had already drifted: only one of them
 * refreshed the shelves when the import phase finished, so a resumed job's
 * books did not appear until it was completely done.
 *
 * ## Why the reloads are guarded
 *
 * `loadBooks()` re-reads every row, and the rows come back as NEW objects, so
 * all five shelf selectors see fresh identities and the whole Library
 * re-renders — twice, since it flips `isLoading` on the way. It fired three
 * times per scan whether or not a single book had moved: the importing-phase
 * refresh ran even when nothing was imported, and `prepareDone ===
 * prepareTotal` is true when both are zero, which is exactly the shape of a
 * scan that found nothing to do.
 *
 * That was affordable while a scan was something you went and asked for. It is
 * not now that one runs at every launch, on the screen the app opens on and
 * during the seconds it is trying to become interactive. So the two
 * in-progress refreshes only run when there is something new to show. The one
 * at the end stays unconditional: it is the backstop that makes the shelves
 * correct no matter what the phases did, including the books scanning removed
 * because their files left the folder, which no counter tracks.
 */
function applySyncProgress(
  job: SyncJobView,
  set: (partial: Partial<BooksState>) => void,
  get: () => BooksState,
  notify: boolean,
) {
  set({ sync: jobToSyncState(job) });

  // Books just landed: show them without waiting for their covers.
  if (
    job.phase === "importing" &&
    job.addedCount > 0 &&
    job.importDone === job.importTotal
  ) {
    get().loadBooks();
  }

  // Covers and titles arriving, in batches so a big folder does not reload
  // the shelves once per book.
  if (job.phase === "preparing" && job.prepareTotal > 0) {
    _preparedSinceLastLoad++;
    if (
      _preparedSinceLastLoad >= LOAD_BOOKS_EVERY_N ||
      job.prepareDone === job.prepareTotal
    ) {
      _preparedSinceLastLoad = 0;
      get().loadBooks();
    }
  }

  if (job.status === "completed" || job.status === "failed") {
    get().loadBooks();
    if (notify) showToast({ key: SCAN_TOAST, ...scanResultToast(job) });
    if (job.status === "completed") {
      setTimeout(() => set({ sync: IDLE_SYNC }), 2000);
    }
  }
}

export const useBooksStore = create<BooksState>((set, get) => ({
  books: [],
  booksDirectoryUri: null,
  isLoading: false,
  sync: IDLE_SYNC,

  loadBooks: async () => {
    /*
     * `isLoading` is only ever asked one question: do we not know what is in
     * the library yet. That is true exactly once, before the first read.
     *
     * Announcing every REFRESH through it cost a whole extra render of this
     * screen for nothing — the shelves already hold books while it re-reads,
     * and the only thing that reads the flag is the empty state, which cannot
     * show while they do. A refresh now lands in one update instead of two.
     */
    const firstRead = get().books.length === 0;
    if (firstRead) set({ isLoading: true });
    const allBooks = await db.select().from(books);
    set(firstRead ? { books: allBooks, isLoading: false } : { books: allBooks });
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

  setDirectoryUri: async (uri: string, options?: { scan?: boolean }) => {
    await db
      .insert(appSettings)
      .values({ key: "booksDirectoryUri", value: uri })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: uri },
      });
    set({ booksDirectoryUri: uri });
    /*
     * `scan: false` sets the root and leaves the reading of it for later.
     *
     * The scan is not cheap and it is not on another thread: it opens every
     * EPUB it finds, pulls metadata and a cover out of each, and writes rows,
     * all on the JS thread, in the background, for as long as it takes. That
     * is fine when the Library is the thing on screen, because the Library has
     * a gap that says so. It is not fine during onboarding, where the only
     * thing on screen is Samwell writing a sentence, and the sentence stops
     * dead every time the pipeline takes the thread.
     *
     * Onboarding therefore sets the root here and starts the scan on the way
     * out, so it runs against the Library that is about to explain it.
     */
    if (options?.scan !== false) await get().syncBooks();
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

    // Resume pipeline in background. Silent: a job the last app kill
    // interrupted is finishing work the reader already watched start, and a
    // result toast for it at launch would be answering a question nobody asked.
    resumeRunningSyncIfAny((updatedJob) => {
      applySyncProgress(updatedJob, set, get, false);
    }).catch((e) => console.warn("[books-store] resume error", e));
  },

  scanOnLaunch: async () => {
    if (!get().booksDirectoryUri) await get().loadDirectoryUri();
    if (!get().booksDirectoryUri) return;
    if (get().sync.status === "running") return;
    await get().syncBooks({ notify: true });
  },

  syncBooks: async (options) => {
    const { booksDirectoryUri } = get();
    if (!booksDirectoryUri) return;

    // Don't start a second sync if one is already running
    if (get().sync.status === "running") return;

    _preparedSinceLastLoad = 0;

    const notify = options?.notify ?? false;

    await startOrResumeSync(booksDirectoryUri, (job) => {
      applySyncProgress(job, set, get, notify);
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
/**
 * Whether a scan is going on, and nothing else about it.
 *
 * A scan emits progress several times a second, and `useSyncState` hands back
 * a fresh object each time — so a screen that only wants to know IS one
 * running re-renders on every tick of one. The Library did, on its whole tree,
 * and it now runs a scan at every launch. This is the same subscription
 * narrowed to the one boolean those callers actually read.
 */
export const useSyncRunning = () =>
  useBooksStore((s) => s.sync.status === "running");
