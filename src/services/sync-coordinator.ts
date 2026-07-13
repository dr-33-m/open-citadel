/**
 * sync-coordinator.ts
 *
 * Durable, resumable book-sync pipeline.
 *
 * Phases:
 *   scanning  → discover files, build fingerprints
 *   importing → fast-insert minimal book rows
 *   preparing → background EPUB metadata/cover enrichment (resumable)
 *   finalizing → mark job complete
 *
 * Progress is persisted in sync_jobs + sync_items so the UI can restore
 * "PREPARING x/y" after an app restart.
 */

import { and, eq, isNull, lt, or } from "drizzle-orm";
import {
  EncodingType,
  StorageAccessFramework,
  getInfoAsync,
  readAsStringAsync,
  readDirectoryAsync,
} from "expo-file-system/legacy";

import { db } from "@/db/client";
import { books, syncItems, syncJobs } from "@/db/schema";
import { deleteBookData } from "./book-delete";
import { extractEpubMetadata } from "./book-sync";

// ── Types ────────────────────────────────────────────────────────────────────

export type SyncPhase = "scanning" | "importing" | "preparing" | "finalizing";
export type SyncStatus = "running" | "completed" | "failed" | "cancelled";

export type SyncJobView = {
  id: string;
  directoryUri: string;
  status: SyncStatus;
  phase: SyncPhase;
  scanDone: number;
  scanTotal: number;
  importDone: number;
  importTotal: number;
  prepareDone: number;
  prepareTotal: number;
  failedCount: number;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  lastError: string | null;
};

// ── Constants ────────────────────────────────────────────────────────────────

const CONCURRENCY = 1;
const CHUNK_SIZE = 50;
const RETRY_DELAYS_MS = [5_000, 20_000, 60_000];
const MAX_ATTEMPTS = 3;
/** Minimum ms between progress-state emits to avoid flooding the UI */
const PROGRESS_THROTTLE_MS = 350;

// ── Callbacks ────────────────────────────────────────────────────────────────

type ProgressCallback = (job: SyncJobView) => void;

let _progressCallback: ProgressCallback | null = null;
let _lastEmitAt = 0;

export function setSyncProgressCallback(cb: ProgressCallback | null) {
  _progressCallback = cb;
}

function emitProgress(job: SyncJobView, force = false) {
  if (!_progressCallback) return;
  const now = Date.now();
  if (!force && now - _lastEmitAt < PROGRESS_THROTTLE_MS) return;
  _lastEmitAt = now;
  _progressCallback(job);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function now() {
  return new Date().toISOString();
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildFingerprint(
  uri: string,
  size?: number | null,
  mtime?: number | null,
): string {
  return `${uri}|${size ?? 0}|${mtime ?? 0}`;
}

/**
 * List EPUB URIs under a scan root, branching on scheme:
 *   content:// → Android SAF (returns full content:// URIs) — unchanged behavior
 *   file://    → iOS owned folder (readDirectoryAsync returns names, prefixed)
 */
async function listEpubUris(directoryUri: string): Promise<string[]> {
  if (directoryUri.startsWith("content://")) {
    const allUris =
      await StorageAccessFramework.readDirectoryAsync(directoryUri);
    return allUris.filter((uri) =>
      decodeURIComponent(uri).toLowerCase().endsWith(".epub"),
    );
  }
  const names = await readDirectoryAsync(directoryUri);
  return names
    .filter((n) => n.toLowerCase().endsWith(".epub"))
    .map((n) => `${directoryUri}${n}`);
}

async function getFileFingerprint(uri: string): Promise<string> {
  try {
    const info = await getInfoAsync(uri);
    if (info.exists) {
      const size = (info as any).size ?? null;
      const mtime = (info as any).modificationTime ?? null;
      return buildFingerprint(uri, size, mtime);
    }
  } catch {
    // ignore
  }
  return buildFingerprint(uri);
}

async function updateJob(
  jobId: string,
  fields: Partial<Omit<typeof syncJobs.$inferInsert, "id" | "startedAt">>,
) {
  await db
    .update(syncJobs)
    .set({ ...fields, updatedAt: now() })
    .where(eq(syncJobs.id, jobId));
}

async function getJob(jobId: string): Promise<SyncJobView | null> {
  const rows = await db.select().from(syncJobs).where(eq(syncJobs.id, jobId));
  return (rows[0] as SyncJobView) ?? null;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the most recent running or recently-completed sync job, if any.
 */
export async function getActiveSyncJob(): Promise<SyncJobView | null> {
  const rows = await db
    .select()
    .from(syncJobs)
    .where(eq(syncJobs.status, "running"))
    .orderBy(syncJobs.updatedAt);
  if (rows.length > 0) return rows[rows.length - 1] as SyncJobView;
  return null;
}

/**
 * On app launch: if there's a running job, resume it.
 */
export async function resumeRunningSyncIfAny(
  onProgress: ProgressCallback,
): Promise<void> {
  setSyncProgressCallback(onProgress);
  const job = await getActiveSyncJob();
  if (!job) return;
  // Resume from whichever phase was interrupted
  await runPipeline(job.id, job.directoryUri, job.phase);
}

/**
 * Start a new sync (or resume if one is already running for the same directory).
 */
export async function startOrResumeSync(
  directoryUri: string,
  onProgress: ProgressCallback,
): Promise<string> {
  setSyncProgressCallback(onProgress);

  // Check for existing running job for this directory
  const existing = await db
    .select()
    .from(syncJobs)
    .where(
      and(
        eq(syncJobs.directoryUri, directoryUri),
        eq(syncJobs.status, "running"),
      ),
    );

  if (existing.length > 0) {
    const job = existing[0];
    // Resume in background
    runPipeline(job.id, directoryUri, job.phase as SyncPhase).catch((e) =>
      console.warn("[sync] resume error", e),
    );
    return job.id;
  }

  // Create new job
  const jobId = `job-${uid()}`;
  const ts = now();
  await db.insert(syncJobs).values({
    id: jobId,
    directoryUri,
    status: "running",
    phase: "scanning",
    scanDone: 0,
    scanTotal: 0,
    importDone: 0,
    importTotal: 0,
    prepareDone: 0,
    prepareTotal: 0,
    failedCount: 0,
    startedAt: ts,
    updatedAt: ts,
  });

  // Run pipeline in background
  runPipeline(jobId, directoryUri, "scanning").catch((e) =>
    console.warn("[sync] pipeline error", e),
  );

  return jobId;
}

export async function cancelSync(jobId: string): Promise<void> {
  await updateJob(jobId, { status: "cancelled", finishedAt: now() });
}

// ── Pipeline ─────────────────────────────────────────────────────────────────

async function runPipeline(
  jobId: string,
  directoryUri: string,
  startPhase: SyncPhase,
): Promise<void> {
  try {
    const phases: SyncPhase[] = [
      "scanning",
      "importing",
      "preparing",
      "finalizing",
    ];
    const startIdx = phases.indexOf(startPhase);

    for (let i = startIdx; i < phases.length; i++) {
      const phase = phases[i];
      // Check if cancelled
      const job = await getJob(jobId);
      if (!job || job.status === "cancelled") return;

      await updateJob(jobId, { phase });

      switch (phase) {
        case "scanning":
          await phaseScanning(jobId, directoryUri);
          break;
        case "importing":
          await phaseImporting(jobId);
          break;
        case "preparing":
          await phasePreparing(jobId);
          break;
        case "finalizing":
          await phaseFinalizing(jobId);
          break;
      }
    }
  } catch (e: any) {
    console.error("[sync] pipeline fatal error", e);
    await updateJob(jobId, {
      status: "failed",
      finishedAt: now(),
      lastError: String(e?.message ?? e),
    });
    const job = await getJob(jobId);
    if (job) emitProgress(job, true);
  }
}

// ── Phase 1: Scanning ────────────────────────────────────────────────────────

async function phaseScanning(
  jobId: string,
  directoryUri: string,
): Promise<void> {
  const job = await getJob(jobId);
  if (!job) return;
  emitProgress(job, true);

  // Read directory (scheme-aware: SAF content:// on Android, local file:// on iOS)
  const bookUris = await listEpubUris(directoryUri);

  await updateJob(jobId, { scanTotal: bookUris.length });

  // Load existing books by sourceUri for fingerprint comparison
  const existingBooks = await db.select().from(books);
  const existingByUri = new Map(
    existingBooks.filter((b) => b.sourceUri).map((b) => [b.sourceUri!, b]),
  );

  // Remove stale books whose source files are no longer in the directory
  const currentUriSet = new Set(bookUris);
  for (const [uri, book] of existingByUri) {
    if (!currentUriSet.has(uri)) {
      await deleteBookData(book.id);
    }
  }

  // Load existing sync_items for this job (in case of resume)
  const existingItems = await db
    .select()
    .from(syncItems)
    .where(eq(syncItems.jobId, jobId));
  const existingItemsByUri = new Map(
    existingItems.map((i) => [i.sourceUri, i]),
  );

  let scanDone = 0;
  const ts = now();

  for (const uri of bookUris) {
    const fingerprint = await getFileFingerprint(uri);
    const existing = existingByUri.get(uri);
    const existingItem = existingItemsByUri.get(uri);

    // Determine if this file needs metadata enrichment
    const needsMeta =
      !existing ||
      existing.metaFingerprint !== fingerprint ||
      !existing.coverUrl ||
      existing.author === "Unknown" ||
      !existing.title;

    if (needsMeta && !existingItem) {
      // Enqueue for metadata enrichment
      await db.insert(syncItems).values({
        id: `item-${uid()}`,
        jobId,
        bookId: existing?.id ?? null,
        sourceUri: uri,
        format: "epub",
        fingerprint,
        status: "pending",
        attempts: 0,
        createdAt: ts,
        updatedAt: ts,
      });
    }

    scanDone++;
    await updateJob(jobId, { scanDone });
    const updatedJob = await getJob(jobId);
    if (updatedJob) emitProgress(updatedJob);
  }

  // Count pending items for prepare phase
  const pendingItems = await db
    .select()
    .from(syncItems)
    .where(and(eq(syncItems.jobId, jobId), eq(syncItems.status, "pending")));

  await updateJob(jobId, {
    scanDone: bookUris.length,
    importTotal: bookUris.length,
    prepareTotal: pendingItems.length,
  });

  // Store the full URI list for importing phase in app_settings (as JSON)
  // We store it as a setting keyed by jobId so importing phase can read it
  const { appSettings } = await import("@/db/schema");
  await db
    .insert(appSettings)
    .values({ key: `sync_uris_${jobId}`, value: JSON.stringify(bookUris) })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: JSON.stringify(bookUris) },
    });

  const updatedJob = await getJob(jobId);
  if (updatedJob) emitProgress(updatedJob, true);
}

// ── Phase 2: Importing ───────────────────────────────────────────────────────

async function phaseImporting(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job) return;

  // Retrieve URI list stored during scanning
  const { appSettings } = await import("@/db/schema");
  const settingRows = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, `sync_uris_${jobId}`));

  if (settingRows.length === 0) return;
  const bookUris: string[] = JSON.parse(settingRows[0].value);

  // Load existing books
  const existingBooks = await db.select().from(books);
  const existingByUri = new Map(
    existingBooks.filter((b) => b.sourceUri).map((b) => [b.sourceUri!, b]),
  );

  const ts = now();
  let importDone = job.importDone;

  // Process in chunks to avoid blocking the JS thread
  for (
    let chunkStart = 0;
    chunkStart < bookUris.length;
    chunkStart += CHUNK_SIZE
  ) {
    const chunk = bookUris.slice(chunkStart, chunkStart + CHUNK_SIZE);

    for (const uri of chunk) {
      if (existingByUri.has(uri)) {
        // Already imported — just update fingerprint if needed
        importDone++;
        continue;
      }

      const fileName = decodeURIComponent(uri).split("/").pop() || uri;
      const title = fileName.replace(/\.epub$/i, "").replace(/[_-]/g, " ");
      const bookId = `book-${uid()}`;

      const fingerprint = await getFileFingerprint(uri);

      await db.insert(books).values({
        id: bookId,
        title,
        author: "Unknown",
        filePath: uri,
        sourceUri: uri,
        addedAt: ts,
        format: "epub",
        syncState: "pending_meta",
        metaFingerprint: fingerprint,
      });

      // Update sync_item with bookId if it exists
      await db
        .update(syncItems)
        .set({ bookId, updatedAt: ts })
        .where(and(eq(syncItems.jobId, jobId), eq(syncItems.sourceUri, uri)));

      importDone++;
    }

    await updateJob(jobId, { importDone });
    const updatedJob = await getJob(jobId);
    if (updatedJob) emitProgress(updatedJob);

    // Yield to keep UI responsive
    await new Promise((r) => setTimeout(r, 0));
  }

  // Clean up the temporary URI list
  await db.delete(appSettings).where(eq(appSettings.key, `sync_uris_${jobId}`));

  await updateJob(jobId, { importDone: bookUris.length });
  const updatedJob = await getJob(jobId);
  if (updatedJob) emitProgress(updatedJob, true);
}

// ── Phase 3: Preparing (metadata enrichment) ─────────────────────────────────

async function phasePreparing(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job) return;
  emitProgress(job, true);

  // Worker loop: claim items one at a time
  async function worker() {
    while (true) {
      // Check cancellation
      const currentJob = await getJob(jobId);
      if (!currentJob || currentJob.status === "cancelled") break;

      // Claim next pending/retry item
      const nowTs = now();
      const candidates = await db
        .select()
        .from(syncItems)
        .where(
          and(
            eq(syncItems.jobId, jobId),
            or(
              eq(syncItems.status, "pending"),
              and(
                eq(syncItems.status, "retry"),
                or(
                  isNull(syncItems.nextRetryAt),
                  lt(syncItems.nextRetryAt, nowTs),
                ),
              ),
            ),
          ),
        )
        .limit(1);

      if (candidates.length === 0) break;

      const item = candidates[0];
      const ts = now();

      // Mark as processing
      await db
        .update(syncItems)
        .set({ status: "processing", updatedAt: ts })
        .where(eq(syncItems.id, item.id));

      // Update book syncState
      if (item.bookId) {
        await db
          .update(books)
          .set({ syncState: "processing_meta" })
          .where(eq(books.id, item.bookId));
      }

      try {
        // Read and parse EPUB
        const base64 = await readAsStringAsync(item.sourceUri, {
          encoding: EncodingType.Base64,
        });

        // Resolve bookId (may have been set during import)
        let bookId = item.bookId;
        if (!bookId) {
          const bookRows = await db
            .select()
            .from(books)
            .where(eq(books.sourceUri, item.sourceUri));
          bookId = bookRows[0]?.id ?? null;
        }

        if (bookId) {
          const meta = await extractEpubMetadata(base64, bookId);
          const updates: Record<string, string | null> = {
            syncState: "ready",
            metaFingerprint: item.fingerprint,
            metaError: null,
          };
          // Only overwrite title if the user hasn't manually edited it
          if (meta.title) {
            const bookRows = await db
              .select()
              .from(books)
              .where(eq(books.id, bookId));
            if (!bookRows[0]?.titleLocked) {
              updates.title = meta.title;
            }
          }
          if (meta.author) updates.author = meta.author;
          if (meta.coverPath) updates.coverUrl = meta.coverPath;
          await db.update(books).set(updates).where(eq(books.id, bookId));
        }

        // Mark item done
        await db
          .update(syncItems)
          .set({ status: "done", updatedAt: now() })
          .where(eq(syncItems.id, item.id));

        // Increment prepareDone
        const updatedJob = await getJob(jobId);
        if (updatedJob) {
          await updateJob(jobId, { prepareDone: updatedJob.prepareDone + 1 });
          const refreshed = await getJob(jobId);
          if (refreshed) emitProgress(refreshed);
        }
      } catch (e: any) {
        const attempts = item.attempts + 1;
        const ts2 = now();

        if (attempts >= MAX_ATTEMPTS) {
          // Permanently failed
          await db
            .update(syncItems)
            .set({
              status: "failed",
              attempts,
              error: String(e?.message ?? e),
              updatedAt: ts2,
            })
            .where(eq(syncItems.id, item.id));

          if (item.bookId) {
            await db
              .update(books)
              .set({
                syncState: "meta_failed",
                metaError: String(e?.message ?? e),
              })
              .where(eq(books.id, item.bookId));
          }

          const updatedJob = await getJob(jobId);
          if (updatedJob) {
            await updateJob(jobId, {
              failedCount: updatedJob.failedCount + 1,
              prepareDone: updatedJob.prepareDone + 1,
            });
            const refreshed = await getJob(jobId);
            if (refreshed) emitProgress(refreshed);
          }
        } else {
          // Schedule retry with backoff
          const delayMs = RETRY_DELAYS_MS[attempts - 1] ?? 60_000;
          const retryAt = new Date(Date.now() + delayMs).toISOString();
          await db
            .update(syncItems)
            .set({
              status: "retry",
              attempts,
              error: String(e?.message ?? e),
              nextRetryAt: retryAt,
              updatedAt: ts2,
            })
            .where(eq(syncItems.id, item.id));

          if (item.bookId) {
            await db
              .update(books)
              .set({ syncState: "pending_meta" })
              .where(eq(books.id, item.bookId));
          }
        }
      }

      // Yield between items
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // Run workers
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const finalJob = await getJob(jobId);
  if (finalJob) emitProgress(finalJob, true);
}

// ── Phase 4: Finalizing ──────────────────────────────────────────────────────

async function phaseFinalizing(jobId: string): Promise<void> {
  await updateJob(jobId, {
    status: "completed",
    finishedAt: now(),
  });
  const job = await getJob(jobId);
  if (job) emitProgress(job, true);
}
