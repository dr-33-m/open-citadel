/**
 * Making somebody a library, on either platform.
 *
 * The one place that knows how an Open Citadel folder comes to exist. Both
 * platforms end in the same state — a folder full of EPUBs that the sync
 * pipeline scans — and get there by completely different routes, because the
 * two operating systems disagree about whose files these are.
 *
 * **iOS** sandboxes the app: it cannot see the device, cannot reference a file
 * in place, and cannot be given a folder. So the app owns a folder in its own
 * Documents directory, and books are COPIED into it through the picker. That
 * folder already exists and is already the scan root (`stores/books`
 * `initLibrary`), so "Samwell made you a folder" is true without anything new
 * being built.
 *
 * **Android** hands the app a folder through the Storage Access Framework, and
 * the EPUBs stay on the reader's own storage. So the reader points at the
 * folder their books are in, a folder is created inside it, and the EPUBs are
 * MOVED there.
 *
 * That move is the only irreversible thing in this file and it is treated
 * accordingly: it copies, verifies the copy, and only then deletes. The tool
 * that calls this is also behind the app's approval gate, so nothing here runs
 * without the reader having seen a prompt first.
 */
import {
  StorageAccessFramework,
  copyAsync,
  deleteAsync,
  downloadAsync,
  getInfoAsync,
  readAsStringAsync,
  writeAsStringAsync,
  EncodingType,
} from 'expo-file-system/legacy';

import { OWNED_DIR, ensureOwnedDir, pickAndImportEpubs } from '@/services/book-import';
import { useBooksStore } from '@/stores/books';

/** What the folder is called, and what Samwell calls it when he speaks of it. */
export const LIBRARY_FOLDER_NAME = 'Open Citadel';

/**
 * How deep the sweep goes below the folder the reader picked.
 *
 * Books live in `Download/`, `Documents/Books/`, `Telegram/Telegram Documents/`
 * and so on. Three levels reaches all of those from a sensible pick. It is
 * bounded at all because somebody will point this at the root of their
 * internal storage, and walking every directory on a phone through SAF — which
 * is one IPC round trip per directory — takes long enough to look like a hang.
 */
const MAX_SWEEP_DEPTH = 3;

export type LibrarySetupResult = {
  ok: boolean;
  platform: 'android' | 'ios';
  /** Where the books ended up, for Samwell to name. Never a raw URI. */
  folderName: string | null;
  imported: number;
  /** Found, but could not be brought in. Left exactly where they were. */
  skipped: number;
  error?: string;
};

function isAndroid(): boolean {
  return process.env.EXPO_OS === 'android';
}

function fileNameFromUri(uri: string): string {
  const tail = decodeURIComponent(uri).split(/[/%]/).pop() ?? '';
  return tail || 'book.epub';
}

function isEpub(uri: string): boolean {
  return decodeURIComponent(uri).toLowerCase().endsWith('.epub');
}

/**
 * Anything with a short trailing extension is taken to be a file.
 *
 * `readDirectoryAsync` returns SAF URIs for files and directories alike and
 * gives no way to tell them apart, so the only true test is to try listing one
 * and see whether it throws. That is one IPC round trip per entry, and a
 * Camera folder with 4,000 photos in it turns a sweep into a hang.
 *
 * So entries that look like files are not probed at all. A folder genuinely
 * named `My.Books` is missed by this, which is a rare miss with a depth limit
 * already sitting behind it, and it is a far better failure than the app
 * appearing to freeze on the one screen where trust is being established.
 */
const LOOKS_LIKE_A_FILE = /\.[a-z0-9]{1,5}$/i;

/** Ceiling on directories opened, whatever the depth limit would allow. */
const MAX_DIRECTORY_PROBES = 200;

/**
 * Every EPUB under a SAF tree, to a bounded depth and a bounded cost.
 */
async function sweepForEpubs(
  dirUri: string,
  skipUri: string,
  budget: { probes: number },
  depth = 0,
): Promise<string[]> {
  let entries: string[] = [];
  try {
    entries = await StorageAccessFramework.readDirectoryAsync(dirUri);
  } catch {
    return [];
  }

  const found: string[] = [];
  const subdirectories: string[] = [];

  for (const entry of entries) {
    // Never sweep the folder we just made. Without this a second run would
    // find the books it moved last time and move them onto themselves.
    if (entry === skipUri) continue;
    if (isEpub(entry)) {
      found.push(entry);
      continue;
    }
    if (depth >= MAX_SWEEP_DEPTH) continue;
    if (LOOKS_LIKE_A_FILE.test(decodeURIComponent(entry))) continue;
    subdirectories.push(entry);
  }

  for (const subdirectory of subdirectories) {
    if (budget.probes <= 0) break;
    budget.probes -= 1;
    found.push(...(await sweepForEpubs(subdirectory, skipUri, budget, depth + 1)));
  }

  return found;
}

/**
 * Above this, the base64 fallback is refused rather than attempted.
 *
 * That path holds the whole file as a JavaScript string, and base64 is a third
 * larger than the bytes it encodes. A 200MB EPUB would be a quarter-gigabyte
 * string on a phone that may have 3GB total, and running out of memory here
 * means the process dies in the middle of moving somebody's books. Refusing is
 * a book reported as skipped and left exactly where it was.
 */
const MAX_BASE64_BYTES = 48 * 1024 * 1024;

/** A copy that is actually present and not empty. */
async function copyLanded(destUri: string): Promise<boolean> {
  const info = await getInfoAsync(destUri);
  return info.exists && info.size > 0;
}

/**
 * Move one EPUB into the library folder, and do not lose it.
 *
 * The order here is the whole safety argument, so it is worth stating.
 *
 * There is no `moveAsync` attempt, deliberately. Expo's SAF surface does not
 * reliably support moving between directories, and the shape this needs — the
 * destination file has to be created through `createFileAsync` before anything
 * can be written to it — means a failed move leaves a stray empty file behind
 * that the next scan then reports as a broken book.
 *
 * So it always copies and then deletes, in that order, with a check between
 * them. `copyAsync` first because it is native and holds nothing in JS memory;
 * base64 only if that fails, and only for a file small enough to survive it.
 * The original is deleted ONLY once the copy has been confirmed present and
 * non-empty. Anything that fails at any point leaves the reader's file exactly
 * where they left it and is reported as skipped, which is the only acceptable
 * outcome for somebody's own book.
 */
async function moveIntoFolder(sourceUri: string, destDirUri: string): Promise<boolean> {
  const name = fileNameFromUri(sourceUri).replace(/\.epub$/i, '');
  let destUri: string | null = null;

  try {
    destUri = await StorageAccessFramework.createFileAsync(
      destDirUri,
      name,
      'application/epub+zip',
    );

    try {
      await copyAsync({ from: sourceUri, to: destUri });
    } catch {
      const info = await getInfoAsync(sourceUri);
      // A file whose size cannot be read is not assumed small. Guessing wrong
      // here is an out-of-memory kill in the middle of moving someone's books.
      if (!info.exists || info.size > MAX_BASE64_BYTES) {
        throw new Error('Too large to copy through memory.');
      }
      const contents = await readAsStringAsync(sourceUri, { encoding: EncodingType.Base64 });
      await writeAsStringAsync(destUri, contents, { encoding: EncodingType.Base64 });
    }

    if (!(await copyLanded(destUri))) {
      throw new Error('The copy did not land.');
    }

    await deleteAsync(sourceUri, { idempotent: true });
    return true;
  } catch (error) {
    console.warn('[library-setup] Could not bring in', sourceUri, error);
    // Clean up the placeholder, so a half-done move does not leave an empty
    // file for the scan to trip over and report as an unreadable book.
    if (destUri) await deleteAsync(destUri, { idempotent: true }).catch(() => {});
    return false;
  }
}

/**
 * Android: pick a folder, make one inside it, move the books in.
 *
 * One system picker, not two. The reader is asked the only question they can
 * answer — where their books are — and everything after that is arithmetic.
 */
async function setUpAndroidLibrary(): Promise<LibrarySetupResult> {
  const base: LibrarySetupResult = {
    ok: false,
    platform: 'android',
    folderName: null,
    imported: 0,
    skipped: 0,
  };

  const permission = await StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permission.granted) {
    // Backing out of a system picker is a decision, not a failure. The tool
    // reports it as one and Samwell is told not to retry.
    return { ...base, error: 'cancelled' };
  }

  const parentUri = permission.directoryUri;
  const folderUri = await StorageAccessFramework.makeDirectoryAsync(
    parentUri,
    LIBRARY_FOLDER_NAME,
  );

  const epubs = await sweepForEpubs(parentUri, folderUri, { probes: MAX_DIRECTORY_PROBES });

  let imported = 0;
  let skipped = 0;
  for (const epub of epubs) {
    if (await moveIntoFolder(epub, folderUri)) imported++;
    else skipped++;
  }

  // Points the library at the new folder and starts the scan. Everything that
  // happens next — metadata, covers, the Library filling in — is the existing
  // pipeline's, unchanged.
  await useBooksStore.getState().setDirectoryUri(folderUri);

  return { ok: true, platform: 'android', folderName: LIBRARY_FOLDER_NAME, imported, skipped };
}

/**
 * iOS: the folder already exists, so this is only the picker.
 *
 * `pickAndImportEpubs` copies whatever is chosen into `OWNED_DIR`, which
 * `initLibrary` has already made the scan root. Nothing of the reader's is
 * moved or deleted; the sandbox would not allow it if we wanted to.
 */
async function setUpIosLibrary(): Promise<LibrarySetupResult> {
  const store = useBooksStore.getState();
  await store.initLibrary();

  const copied = await pickAndImportEpubs();
  if (copied === 0) {
    return {
      ok: false,
      platform: 'ios',
      folderName: LIBRARY_FOLDER_NAME,
      imported: 0,
      skipped: 0,
      error: 'cancelled',
    };
  }

  await store.syncBooks();
  return {
    ok: true,
    platform: 'ios',
    folderName: LIBRARY_FOLDER_NAME,
    imported: copied,
    skipped: 0,
  };
}

export async function setUpLibrary(): Promise<LibrarySetupResult> {
  return isAndroid() ? setUpAndroidLibrary() : setUpIosLibrary();
}

/**
 * The library folder, made if it is not there yet.
 *
 * Downloading free books has to work for somebody who said they had no books
 * and therefore never ran `setUpLibrary`. On iOS that is just the owned
 * folder. On Android it means asking for a folder after all, which is why the
 * download tool needs approval too: it can open a system picker.
 */
async function ensureLibraryFolder(): Promise<string | null> {
  const store = useBooksStore.getState();

  if (!isAndroid()) {
    await ensureOwnedDir();
    await store.initLibrary();
    return OWNED_DIR;
  }

  const existing = store.booksDirectoryUri;
  if (existing) return existing;

  const permission = await StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permission.granted) return null;

  const folderUri = await StorageAccessFramework.makeDirectoryAsync(
    permission.directoryUri,
    LIBRARY_FOLDER_NAME,
  );
  await store.setDirectoryUri(folderUri);
  return folderUri;
}

export type DownloadedBook = { title: string };
export type DownloadFailure = { id: number; error: string };

/**
 * Put a downloaded EPUB into the library folder.
 *
 * Two paths because the destination is two different kinds of thing. A
 * `file://` folder takes the download directly. A SAF folder cannot be a
 * download target at all, so the file lands in the cache first and is written
 * across as base64 — which is why the cache copy is cleaned up afterwards
 * rather than left to the OS.
 */
async function saveEpubTo(
  folderUri: string,
  fileName: string,
  sourceUrl: string,
): Promise<void> {
  if (!folderUri.startsWith('content://')) {
    const result = await downloadAsync(sourceUrl, `${folderUri}${fileName}`);
    if (result.status !== 200) {
      throw new Error(`Project Gutenberg answered ${result.status}.`);
    }
    return;
  }

  const staging = `${OWNED_DIR}${fileName}`;
  await ensureOwnedDir();
  const result = await downloadAsync(sourceUrl, staging);
  try {
    if (result.status !== 200) {
      throw new Error(`Project Gutenberg answered ${result.status}.`);
    }
    const destUri = await StorageAccessFramework.createFileAsync(
      folderUri,
      fileName.replace(/\.epub$/i, ''),
      'application/epub+zip',
    );
    const contents = await readAsStringAsync(staging, { encoding: EncodingType.Base64 });
    await writeAsStringAsync(destUri, contents, { encoding: EncodingType.Base64 });
  } finally {
    await deleteAsync(staging, { idempotent: true }).catch(() => {});
  }
}

/** A filename that survives being a URL. See `safeFileName` in book-import. */
function safeName(title: string): string {
  const cleaned =
    title
      .normalize('NFKD')
      .replace(/[^A-Za-z0-9-_]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 60) || 'book';
  return `${cleaned}.epub`;
}

export async function downloadBooksIntoLibrary(
  books: { id: number; title: string; epubUrl: string }[],
): Promise<{ downloaded: string[]; failed: DownloadFailure[]; cancelled: boolean }> {
  const folderUri = await ensureLibraryFolder();
  if (!folderUri) return { downloaded: [], failed: [], cancelled: true };

  const downloaded: string[] = [];
  const failed: DownloadFailure[] = [];

  for (const book of books) {
    try {
      await saveEpubTo(folderUri, safeName(book.title), book.epubUrl);
      downloaded.push(book.title);
    } catch (error) {
      failed.push({
        id: book.id,
        error: error instanceof Error ? error.message : 'The download failed.',
      });
    }
  }

  if (downloaded.length > 0) await useBooksStore.getState().syncBooks();
  return { downloaded, failed, cancelled: false };
}

/**
 * Whether there is already a library, so onboarding can skip offering one.
 *
 * Reads the row rather than the store, and that is the point. `booksDirectoryUri`
 * is loaded by the Library page on boot, and on a first run the Library page is
 * exactly the screen that never mounted — so the store's answer here is always
 * "no library", correct by luck rather than by knowing.
 */
export async function hasLibrary(): Promise<boolean> {
  const store = useBooksStore.getState();
  if (!store.booksDirectoryUri) await store.loadDirectoryUri();
  const uri = useBooksStore.getState().booksDirectoryUri;
  return typeof uri === 'string' && uri.length > 0;
}
