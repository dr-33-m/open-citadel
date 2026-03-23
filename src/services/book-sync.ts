import {
  StorageAccessFramework,
  documentDirectory,
  readAsStringAsync,
  writeAsStringAsync,
  makeDirectoryAsync,
  getInfoAsync,
  EncodingType,
} from 'expo-file-system/legacy';
import JSZip from 'jszip';

import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { books } from '@/db/schema';

const BOOKS_DIR = `${documentDirectory}books/`;
const COVERS_DIR = `${documentDirectory}covers/`;

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

async function copyToLocal(
  safUri: string,
  bookId: string
): Promise<{ localPath: string; base64: string }> {
  await ensureDir(BOOKS_DIR);
  const localPath = `${BOOKS_DIR}${bookId}.epub`;
  const base64 = await readAsStringAsync(safUri, {
    encoding: EncodingType.Base64,
  });
  await writeAsStringAsync(localPath, base64, {
    encoding: EncodingType.Base64,
  });
  return { localPath, base64 };
}

type EpubMetadata = {
  title: string | null;
  author: string | null;
  coverPath: string | null;
};

/**
 * Parse the epub ZIP (as base64) to extract title, author, and cover image.
 * All three are derived from the OPF manifest in a single pass.
 */
async function extractEpubMetadata(
  base64: string,
  bookId: string
): Promise<EpubMetadata> {
  try {
    const zip = await JSZip.loadAsync(base64, { base64: true });

    // 1. Find OPF via container.xml
    const containerFile = zip.file('META-INF/container.xml');
    if (!containerFile) return { title: null, author: null, coverPath: null };

    const containerXml = await containerFile.async('string');
    const opfMatch = containerXml.match(/full-path="([^"]+)"/);
    if (!opfMatch) return { title: null, author: null, coverPath: null };

    const opfPath = opfMatch[1];
    const opfDir = opfPath.includes('/')
      ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1)
      : '';

    const opfFile = zip.file(opfPath);
    if (!opfFile) return { title: null, author: null, coverPath: null };
    const opf = await opfFile.async('string');

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
          opf.match(new RegExp(`<item[^>]+id="${coverId}"[^>]+href="([^"]+)"`, 'i')) ||
          opf.match(new RegExp(`<item[^>]+href="([^"]+)"[^>]+id="${coverId}"`, 'i'));
        if (itemMatch) coverHref = itemMatch[1];
      }
    }

    // Fallback: id="cover-image"
    if (!coverHref) {
      const fallback = opf.match(/<item[^>]+id="cover-image"[^>]+href="([^"]+)"/i);
      if (fallback) coverHref = fallback[1];
    }

    // 4. Extract and save cover image
    let coverPath: string | null = null;
    if (coverHref) {
      const fullCoverPath = opfDir + coverHref;
      const coverFile = zip.file(fullCoverPath);
      if (coverFile) {
        const coverBase64 = await coverFile.async('base64');
        await ensureDir(COVERS_DIR);
        const ext = coverHref.split('.').pop()?.toLowerCase() || 'jpg';
        coverPath = `${COVERS_DIR}${bookId}.${ext}`;
        await writeAsStringAsync(coverPath, coverBase64, {
          encoding: EncodingType.Base64,
        });
      }
    }

    return { title, author, coverPath };
  } catch (e) {
    console.warn('[book-sync] metadata extraction failed:', e);
    return { title: null, author: null, coverPath: null };
  }
}

export async function syncBooksFromDirectory(
  directoryUri: string
): Promise<void> {
  // Remove stale content:// entries
  const oldBooks = await db.select().from(books);
  for (const book of oldBooks) {
    if (book.filePath?.startsWith('content://')) {
      await db.delete(books).where(eq(books.id, book.id));
    }
  }

  const fileUris =
    await StorageAccessFramework.readDirectoryAsync(directoryUri);

  const epubUris = fileUris.filter((uri) =>
    decodeURIComponent(uri).toLowerCase().endsWith('.epub')
  );

  const existingBooks = await db.select().from(books);
  const existingBySource = new Map(
    existingBooks.filter((b) => b.sourceUri).map((b) => [b.sourceUri!, b])
  );

  const now = new Date().toISOString();

  for (const safUri of epubUris) {
    const existing = existingBySource.get(safUri);

    if (existing) {
      // Backfill missing cover or title for already-imported books
      const needsCover = !existing.coverUrl;
      const needsTitle = !existing.title || existing.author === 'Unknown';

      if ((needsCover || needsTitle) && existing.filePath) {
        const base64 = await readAsStringAsync(existing.filePath, {
          encoding: EncodingType.Base64,
        }).catch(() => null);

        if (base64) {
          const meta = await extractEpubMetadata(base64, existing.id);
          const updates: Partial<typeof existing> = {};
          if (needsCover && meta.coverPath) updates.coverUrl = meta.coverPath;
          if (needsTitle && meta.title) updates.title = meta.title;
          if (needsTitle && meta.author) updates.author = meta.author;

          if (Object.keys(updates).length > 0) {
            await db.update(books).set(updates).where(eq(books.id, existing.id));
          }
        }
      }
      continue;
    }

    // New book — extract metadata and insert
    const decodedUri = decodeURIComponent(safUri);
    const fileName = decodedUri.split('/').pop() || decodedUri;
    const filenameFallback = fileName
      .replace(/\.epub$/i, '')
      .replace(/[_-]/g, ' ');

    const id = `book-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { localPath, base64 } = await copyToLocal(safUri, id);
    const meta = await extractEpubMetadata(base64, id);

    await db.insert(books).values({
      id,
      title: meta.title ?? filenameFallback,
      author: meta.author ?? 'Unknown',
      filePath: localPath,
      sourceUri: safUri,
      coverUrl: meta.coverPath ?? undefined,
      addedAt: now,
    });

    existingBySource.set(safUri, {
      id,
      title: meta.title ?? filenameFallback,
      author: meta.author ?? 'Unknown',
      filePath: localPath,
      sourceUri: safUri,
      coverUrl: meta.coverPath,
      addedAt: now,
      status: null,
      isFavorite: 0,
      category: null,
      fileSize: null,
      lastModified: null,
      totalPages: null,
      completedAt: null,
    });
  }
}
