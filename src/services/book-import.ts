/**
 * book-import.ts
 *
 * iOS book ingestion. iOS is sandboxed — it cannot scan the device or reference
 * files in place (the Android SAF model), so EPUBs must be *copied* into an
 * app-owned folder. This module owns that folder and every "get an EPUB into the
 * library" path (document picker, "Open in", Files-app drop → all copy here).
 *
 * The owned folder lives in the app's private Documents directory and is scanned
 * by the existing sync pipeline (which branches on the `file://` scheme).
 *
 * Android is untouched — it keeps referencing EPUBs in place via SAF `content://`
 * URIs and never calls into this module.
 */

import {
  copyAsync,
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  readDirectoryAsync,
} from "expo-file-system/legacy";
import * as DocumentPicker from "expo-document-picker";

/**
 * App-owned library folder for iOS. Deliberately space-free so
 * `OWNED_DIR + fileName` is always a valid, unencoded file:// URL that Readium
 * (Swift `URL(string:)`), `readAsStringAsync`, and the chapter extractor can all
 * consume without any percent-encoding logic.
 */
export const OWNED_DIR = `${documentDirectory}OpenCitadel/`;

/** EPUB UTIs / MIME types accepted by the document picker. */
const EPUB_TYPES = ["application/epub+zip", "org.idpf.epub-container"];

export async function ensureOwnedDir(): Promise<void> {
  const info = await getInfoAsync(OWNED_DIR);
  if (!info.exists) {
    await makeDirectoryAsync(OWNED_DIR, { intermediates: true });
  }
}

/**
 * Sanitize an original filename to a URL-safe ASCII `.epub` name. Non-ASCII
 * titles are recovered from EPUB metadata during enrichment, so aggressive
 * cleaning here is harmless to the user-visible title.
 */
function safeFileName(original: string): string {
  const withoutExt = original.replace(/\.epub$/i, "");
  const cleaned =
    withoutExt
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9-_]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "") || "book";
  return `${cleaned}.epub`;
}

/**
 * Return a destination path in OWNED_DIR that does not collide with an existing
 * file. Appends `-1`, `-2`, … before the extension on conflict.
 */
async function uniqueDestPath(fileName: string): Promise<string> {
  const existing = new Set(await readDirectoryAsync(OWNED_DIR));
  const base = fileName.replace(/\.epub$/i, "");
  let candidate = `${base}.epub`;
  let n = 1;
  while (existing.has(candidate)) {
    candidate = `${base}-${n}.epub`;
    n++;
  }
  return `${OWNED_DIR}${candidate}`;
}

/**
 * Copy a single external EPUB URI into the owned folder. Returns the local
 * file:// path, or null if the copy failed.
 */
async function copyIntoLibrary(
  sourceUri: string,
  originalName: string,
): Promise<string | null> {
  try {
    const dest = await uniqueDestPath(safeFileName(originalName));
    await copyAsync({ from: sourceUri, to: dest });
    return dest;
  } catch (e) {
    console.warn("[book-import] copy failed:", originalName, e);
    return null;
  }
}

/**
 * iOS "Get Started" / "Add Books": present the document picker (multi-select),
 * copy each chosen EPUB into the owned folder. Returns the count copied.
 */
export async function pickAndImportEpubs(): Promise<number> {
  await ensureOwnedDir();

  const result = await DocumentPicker.getDocumentAsync({
    type: EPUB_TYPES,
    multiple: true,
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.length) return 0;

  let copied = 0;
  for (const asset of result.assets) {
    const name = asset.name || asset.uri.split("/").pop() || "book.epub";
    const dest = await copyIntoLibrary(asset.uri, name);
    if (dest) copied++;
  }
  return copied;
}

/**
 * Handle an incoming EPUB opened into the app ("Open in Open Citadel", share
 * sheet, AirDrop). Copies it into the owned folder.
 */
export async function importIncomingFile(uri: string): Promise<string | null> {
  await ensureOwnedDir();
  const name = decodeURIComponent(uri).split("/").pop() || "book.epub";
  if (!name.toLowerCase().endsWith(".epub")) return null;
  return copyIntoLibrary(uri, name);
}
