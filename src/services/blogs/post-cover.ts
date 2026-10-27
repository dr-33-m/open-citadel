/**
 * A post's cover kept on the phone, as a book's is.
 *
 * A post's reader copy names its picture by the blog's address for it. The
 * screens draw that through the image cache, but the player's notification
 * fetches it again on its own, and came up blank: some blogs turn away a
 * fetch that is not a browser's. A book's cover is a file on the phone, and
 * shows. So a post's becomes one too: the picture the screens have already
 * drawn, copied out of the image cache, or fetched once if it is not there.
 */
import { eq } from 'drizzle-orm';
import { Image } from 'expo-image';
import { copyAsync, deleteAsync, documentDirectory, downloadAsync, getInfoAsync, makeDirectoryAsync } from 'expo-file-system/legacy';

import { db } from '@/db/client';
import { books } from '@/db/schema';

const COVERS_DIR = `${documentDirectory}covers/`;

/** A remote picture, worth keeping; a file is kept already. */
const isRemote = (url: string | null): url is string => !!url && /^https?:\/\//i.test(url);

/** The picture's own file from the image cache: drawn already, or drawn now. */
async function cachedPicture(url: string): Promise<string | null> {
  const cached = await Image.getCachePathAsync(url).catch(() => null);
  if (cached) return cached;
  const fetched = await Image.prefetch(url, { cachePolicy: 'disk' }).catch(() => false);
  return fetched ? Image.getCachePathAsync(url).catch(() => null) : null;
}

/** Copies the picture at `url` to `target`. False when there is no picture to be had. */
async function savePicture(url: string, target: string): Promise<boolean> {
  const cached = await cachedPicture(url);
  if (cached) {
    await copyAsync({ from: cached.startsWith('file://') ? cached : `file://${cached}`, to: target });
    return true;
  }
  const result = await downloadAsync(url, target);
  // A page (a refusal, a sign-in) can answer 200 as well.
  const type = Object.entries(result.headers ?? {}).find(([k]) => k.toLowerCase() === 'content-type')?.[1] ?? '';
  if (result.status >= 200 && result.status < 300 && !/^text\//i.test(type.trim())) return true;
  await deleteAsync(target, { idempotent: true });
  return false;
}

/** Covers being kept now, by book: opening a post and listening to it ask for the same one. */
const keeping = new Map<string, Promise<void>>();

/**
 * Keeps the cover of a post's reader copy on the phone and names the file in
 * its row. Never throws: a post with its cover still at the blog's address
 * is still a post.
 */
export function keepPostCover(bookId: string): Promise<void> {
  let task = keeping.get(bookId);
  if (!task) {
    task = keep(bookId).finally(() => keeping.delete(bookId));
    keeping.set(bookId, task);
  }
  return task;
}

async function keep(bookId: string): Promise<void> {
  try {
    const row = db.select({ coverUrl: books.coverUrl }).from(books).where(eq(books.id, bookId)).get();
    const url = row?.coverUrl ?? null;
    if (!isRemote(url)) return;
    const target = `${COVERS_DIR}post-${bookId}`;
    if (!(await getInfoAsync(target)).exists) {
      await makeDirectoryAsync(COVERS_DIR, { intermediates: true });
      if (!(await savePicture(url, target))) return;
    }
    db.update(books).set({ coverUrl: target }).where(eq(books.id, bookId)).run();
  } catch {
    // Left at the blog's address.
  }
}
