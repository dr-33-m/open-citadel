import {
  EncodingType,
  StorageAccessFramework,
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from "expo-file-system/legacy";
import JSZip from "jszip";

import { jszipArchive, openEpub, UnreadableBook, type EpubArchive } from "@/services/book-text/archive";
import { bytesToBase64 } from "@/utils/bytes";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { books } from "@/db/schema";

const COVERS_DIR = `${documentDirectory}covers/`;
// Lower concurrency: metadata-only now (just reads, no large writes), but
// each read loads the full EPUB as base64, so keep memory pressure low.
const CONCURRENCY = 3;

async function ensureDir(dir: string) {
  const info = await getInfoAsync(dir);
  if (!info.exists) {
    await makeDirectoryAsync(dir, { intermediates: true });
  }
}

export async function pickBooksDirectory(): Promise<string | null> {
  const permissions =
    await StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permissions.granted) return null;
  return permissions.directoryUri;
}

type EpubMetadata = {
  title: string | null;
  author: string | null;
  coverPath: string | null;
};

/** What metadata is read through: an entry's text, or its bytes. */
type EpubEntries = Pick<EpubArchive, "text" | "bytes">;

const NO_METADATA: EpubMetadata = { title: null, author: null, coverPath: null };

/**
 * Title, author and cover from an EPUB's OPF manifest, in a single pass:
 * container.xml names the OPF, the OPF names the rest. Whichever way the
 * archive is read, this is the one reading of it.
 */
async function metadataFrom(entries: EpubEntries, bookId: string): Promise<EpubMetadata> {
  // 1. Find OPF via container.xml
  const containerXml = await entries.text("META-INF/container.xml");
  if (!containerXml) return NO_METADATA;
  const opfMatch = containerXml.match(/full-path="([^"]+)"/);
  if (!opfMatch) return NO_METADATA;

  const opfPath = opfMatch[1];
  const opfDir = opfPath.includes("/")
    ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1)
    : "";

  const opf = await entries.text(opfPath);
  if (!opf) return NO_METADATA;

  // 2. Extract title and author from Dublin Core metadata
  const titleMatch = opf.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
  const authorMatch = opf.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i);
  const title = titleMatch?.[1]?.trim() ?? null;
  const author = authorMatch?.[1]?.trim() ?? null;

  // 3. Find cover image href
  let coverHref: string | null = null;

  // epub3: <item properties="cover-image" href="..."/>
  const epub3Match =
    opf.match(/<item[^>]+properties="cover-image"[^>]+href="([^"]+)"/i) ||
    opf.match(/<item[^>]+href="([^"]+)"[^>]+properties="cover-image"/i);
  if (epub3Match) coverHref = epub3Match[1];

  // epub2 / calibre: <meta name="cover" content="{itemId}"/>
  if (!coverHref) {
    const metaMatch =
      opf.match(/<meta[^>]+name="cover"[^>]+content="([^"]+)"/i) ||
      opf.match(/<meta[^>]+content="([^"]+)"[^>]+name="cover"/i);
    if (metaMatch) {
      const coverId = metaMatch[1];
      const itemMatch =
        opf.match(
          new RegExp(`<item[^>]+id="${coverId}"[^>]+href="([^"]+)"`, "i"),
        ) ||
        opf.match(
          new RegExp(`<item[^>]+href="([^"]+)"[^>]+id="${coverId}"`, "i"),
        );
      if (itemMatch) coverHref = itemMatch[1];
    }
  }

  // Fallback: id="cover-image"
  if (!coverHref) {
    const fallback = opf.match(
      /<item[^>]+id="cover-image"[^>]+href="([^"]+)"/i,
    );
    if (fallback) coverHref = fallback[1];
  }

  // 4. Extract and save cover image
  let coverPath: string | null = null;
  if (coverHref) {
    const cover = await entries.bytes(opfDir + coverHref);
    if (cover) {
      await ensureDir(COVERS_DIR);
      const ext = coverHref.split(".").pop()?.toLowerCase() || "jpg";
      coverPath = `${COVERS_DIR}${bookId}.${ext}`;
      await writeAsStringAsync(coverPath, bytesToBase64(cover), {
        encoding: EncodingType.Base64,
      });
    }
  }

  return { title, author, coverPath };
}

/**
 * Parse the epub ZIP (as base64) to extract title, author, and cover image.
 * Reads the whole archive. Never throws; a file it cannot parse answers with
 * nulls.
 */
export async function extractEpubMetadata(
  base64: string,
  bookId: string,
): Promise<EpubMetadata> {
  try {
    return await metadataFrom(jszipArchive(await JSZip.loadAsync(base64, { base64: true })), bookId);
  } catch (e) {
    console.warn("[book-sync] metadata extraction failed:", e);
    return NO_METADATA;
  }
}

/**
 * Title, author and cover of the EPUB at `uri`, reading only the entries they
 * come from (`openEpub`): its directory, container.xml, the OPF and the cover.
 *
 * Like the whole-file read it replaces, a file that cannot be read at all
 * throws (the sync retries it), and one that reads but holds no metadata
 * answers with nulls.
 */
export async function readEpubMetadata(uri: string, bookId: string): Promise<EpubMetadata> {
  try {
    return await metadataFrom(await openEpub(uri), bookId);
  } catch (e) {
    if (e instanceof UnreadableBook) throw e;
    console.warn("[book-sync] metadata extraction failed:", e);
    return NO_METADATA;
  }
}

export async function syncBooksFromDirectory(
  directoryUri: string,
  onPhase1Complete?: () => Promise<void>,
  onProgress?: (done: number, total: number) => Promise<void>,
): Promise<void> {
  // 1. Read and filter directory
  const fileUris =
    await StorageAccessFramework.readDirectoryAsync(directoryUri);
  const bookUris = fileUris.filter((uri) =>
    decodeURIComponent(uri).toLowerCase().endsWith(".epub"),
  );

  // 3. Separate new from already-imported
  const allExisting = await db.select().from(books);
  const existingBySource = new Map(
    allExisting.filter((b) => b.sourceUri).map((b) => [b.sourceUri!, b]),
  );
  const newUris = bookUris.filter((uri) => !existingBySource.has(uri));

  const now = new Date().toISOString();

  // ── Phase 1: batch-insert all new books immediately ─────────────────────
  // Books appear in the library right away with filename-derived titles.
  // filePath = sourceUri (the SAF content:// URI) — Readium reads it directly.
  type Phase1Record = { id: string; safUri: string };
  const phase1Records: Phase1Record[] = [];

  if (newUris.length > 0) {
    for (let i = 0; i < newUris.length; i++) {
      const safUri = newUris[i];
      const fileName = decodeURIComponent(safUri).split("/").pop() || safUri;
      const title = fileName.replace(/\.epub$/i, "").replace(/[_-]/g, " ");
      const id = `book-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`;
      phase1Records.push({ id, safUri });

      await db.insert(books).values({
        id,
        title,
        author: "Unknown",
        filePath: safUri,
        sourceUri: safUri,
        addedAt: now,
        format: "epub",
      });
    }

    // Notify store: books are in DB, show them now
    await onPhase1Complete?.();

    // ── Phase 2: metadata-only enrichment, CONCURRENCY at a time ─────────────
    // Reads each EPUB to extract proper title/author/cover image.
    const uriToRecord = new Map(phase1Records.map((r) => [r.safUri, r]));
    let done = 0;
    let queueIdx = 0;

    async function worker() {
      while (true) {
        const idx = queueIdx++;
        if (idx >= newUris.length) break;

        const safUri = newUris[idx];
        const { id } = uriToRecord.get(safUri)!;

        try {
          const base64 = await readAsStringAsync(safUri, {
            encoding: EncodingType.Base64,
          });
          const meta = await extractEpubMetadata(base64, id);
          const updates: Record<string, string | null> = {};
          if (meta.title) updates.title = meta.title;
          if (meta.author) updates.author = meta.author;
          if (meta.coverPath) updates.coverUrl = meta.coverPath;
          if (Object.keys(updates).length > 0) {
            await db.update(books).set(updates).where(eq(books.id, id));
          }
        } catch (e) {
          console.warn("[book-sync] metadata extraction failed:", safUri, e);
        }

        done++;
        await onProgress?.(done, newUris.length);
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  } else {
    await onPhase1Complete?.();
  }

  // ── Backfill: fix missing cover/title for already-imported EPUBs ──────────
  // Only runs on books that have a local filePath (previously copied).
  for (const safUri of bookUris) {
    const existing = existingBySource.get(safUri);
    if (!existing || !existing.filePath) continue;
    const needsCover = !existing.coverUrl;
    const needsTitle = !existing.title || existing.author === "Unknown";
    if (!needsCover && !needsTitle) continue;

    const base64 = await readAsStringAsync(existing.filePath, {
      encoding: EncodingType.Base64,
    }).catch(() => null);
    if (!base64) continue;

    const meta = await extractEpubMetadata(base64, existing.id);
    const updates: Record<string, string> = {};
    if (needsCover && meta.coverPath) updates.coverUrl = meta.coverPath;
    if (needsTitle && meta.title) updates.title = meta.title;
    if (needsTitle && meta.author) updates.author = meta.author;
    if (Object.keys(updates).length > 0) {
      await db.update(books).set(updates).where(eq(books.id, existing.id));
    }
  }
}
