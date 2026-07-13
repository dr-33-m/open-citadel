/**
 * path-reanchor.ts
 *
 * iOS stores app files under the Documents directory, whose absolute path
 * includes the app-container UUID (…/Application/<UUID>/Documents/…). That UUID
 * is NOT stable — it changes on restore-from-backup and device migration — so
 * absolute paths persisted in the DB (book files, covers, downloaded models) can
 * point at a container that no longer exists, making books/covers/models fail to
 * load, and (worse) making the sync scanner treat every book as "removed" and
 * delete it.
 *
 * On launch we re-anchor any stored `file://…/Documents/<rest>` path onto the
 * CURRENT Documents directory. Content:// URIs (Android SAF) are left untouched.
 * This runs before the library loads/scans, so paths are valid by the time
 * anything reads them.
 */

import { eq } from "drizzle-orm";
import { Platform } from "react-native";
import { documentDirectory } from "expo-file-system/legacy";

import { db } from "@/db/client";
import { books, localModels, syncItems } from "@/db/schema";

const DOCUMENTS_MARKER = "/Documents/";

/**
 * Re-root a stored path onto the current Documents dir. Returns the input
 * unchanged for non-file URIs (e.g. Android content://) or paths that already
 * point at the current container. A non-null input always yields a non-null
 * result (overloads keep that visible to non-nullable columns).
 */
function reanchor(stored: string, docDir: string): string;
function reanchor(stored: string | null, docDir: string): string | null;
function reanchor(stored: string | null, docDir: string): string | null {
  if (!stored || !stored.startsWith("file://")) return stored;
  const i = stored.indexOf(DOCUMENTS_MARKER);
  if (i === -1) return stored;
  const suffix = stored.slice(i + DOCUMENTS_MARKER.length);
  const next = `${docDir}${suffix}`;
  return next === stored ? stored : next;
}

/**
 * Rewrite stale container paths in the DB onto the current Documents dir.
 * iOS-only — Android internal storage has no volatile container UUID and book
 * files are referenced in place via content:// URIs.
 */
export async function reanchorLocalPaths(): Promise<void> {
  if (Platform.OS !== "ios") return;
  const docDir = documentDirectory;
  if (!docDir) return;

  const allBooks = await db.select().from(books);

  // Fast path: if a local book path already points at the current container,
  // nothing moved — all app paths are written against the same Documents dir.
  const sample = allBooks.find((b) => b.filePath?.startsWith("file://"));
  if (sample && sample.filePath!.startsWith(docDir)) return;

  for (const b of allBooks) {
    const filePath = reanchor(b.filePath, docDir);
    const sourceUri = reanchor(b.sourceUri, docDir);
    const coverUrl = reanchor(b.coverUrl, docDir);
    if (
      filePath !== b.filePath ||
      sourceUri !== b.sourceUri ||
      coverUrl !== b.coverUrl
    ) {
      await db
        .update(books)
        .set({ filePath, sourceUri, coverUrl })
        .where(eq(books.id, b.id));
    }
  }

  // Pending sync items reference the source file by URI (used for matching).
  const items = await db.select().from(syncItems);
  for (const it of items) {
    const sourceUri = reanchor(it.sourceUri, docDir);
    if (sourceUri !== it.sourceUri) {
      await db
        .update(syncItems)
        .set({ sourceUri })
        .where(eq(syncItems.id, it.id));
    }
  }

  // Downloaded on-device model files.
  const models = await db.select().from(localModels);
  for (const m of models) {
    if (!m.filePath) continue;
    const filePath = reanchor(m.filePath, docDir);
    if (filePath && filePath !== m.filePath) {
      await db
        .update(localModels)
        .set({ filePath })
        .where(eq(localModels.id, m.id));
    }
  }
}
