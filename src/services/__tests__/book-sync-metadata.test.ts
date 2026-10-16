import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const files = new Map<string, Buffer>();
const written = new Map<string, string>();
const reads: { position?: number; length?: number }[] = [];

vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
  StorageAccessFramework: {},
  getInfoAsync: async (uri: string) => {
    const file = files.get(uri);
    return file ? { exists: true, size: file.length } : { exists: uri.startsWith('file:///docs/') };
  },
  makeDirectoryAsync: async () => undefined,
  readAsStringAsync: async (uri: string, options: { position?: number; length?: number }) => {
    const file = files.get(uri);
    if (!file) throw new Error(`No file at ${uri}`);
    reads.push({ position: options.position, length: options.length });
    const slice = options.position != null && options.length != null ? file.subarray(options.position, options.position + options.length) : file;
    return slice.toString('base64');
  },
  writeAsStringAsync: async (uri: string, contents: string) => {
    written.set(uri, contents);
  },
}));
vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/db/schema', () => ({ books: {} }));

const { extractEpubMetadata, readEpubMetadata } = await import('@/services/book-sync');

async function epub({ title, author, coverHref, padding = 0 }: { title: string; author: string; coverHref: string | null; padding?: number }) {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>');
  const coverItem = coverHref ? `<item id="cover" href="${coverHref}" media-type="image/jpeg" properties="cover-image"/>` : '';
  zip.file(
    'OEBPS/content.opf',
    `<package><metadata><dc:title>${title}</dc:title><dc:creator>${author}</dc:creator></metadata><manifest>${coverItem}</manifest></package>`,
  );
  if (coverHref) zip.file(`OEBPS/${coverHref}`, new Uint8Array(3000).map((_, i) => i % 251));
  if (padding) zip.file('OEBPS/chapter.xhtml', 'a long chapter. '.repeat(padding));
  return Buffer.from(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
}

beforeEach(() => {
  files.clear();
  written.clear();
  reads.length = 0;
});

describe('readEpubMetadata', () => {
  it('reads what the whole-file read reads, cover bytes and all', async () => {
    const file = await epub({ title: 'Meditations', author: 'Marcus Aurelius', coverHref: 'images/cover.jpg', padding: 50_000 });
    files.set('content://books/a.epub', file);

    const ranged = await readEpubMetadata('content://books/a.epub', 'b1');
    const rangedCover = written.get('file:///docs/covers/b1.jpg');
    written.clear();
    const whole = await extractEpubMetadata(file.toString('base64'), 'b1');

    expect(ranged).toEqual({ title: 'Meditations', author: 'Marcus Aurelius', coverPath: 'file:///docs/covers/b1.jpg' });
    expect(ranged).toEqual(whole);
    expect(rangedCover).toBe(written.get('file:///docs/covers/b1.jpg'));
  });

  it('never reads the whole file when it can read in pieces', async () => {
    files.set('content://books/a.epub', await epub({ title: 'T', author: 'A', coverHref: 'c.jpg', padding: 50_000 }));
    await readEpubMetadata('content://books/a.epub', 'b1');
    expect(reads.every((read) => read.position != null && read.length != null)).toBe(true);
  });

  it('answers nulls for an EPUB with nothing to read, as before', async () => {
    const zip = new JSZip();
    zip.file('mimetype', 'application/epub+zip');
    files.set('content://books/empty.epub', Buffer.from(await zip.generateAsync({ type: 'uint8array' })));
    expect(await readEpubMetadata('content://books/empty.epub', 'b2')).toEqual({ title: null, author: null, coverPath: null });
  });

  it('falls back to the whole file for one it cannot read in pieces, and throws for one it cannot read at all', async () => {
    files.set('content://books/junk.epub', Buffer.from('not a zip at all'));
    expect(await readEpubMetadata('content://books/junk.epub', 'b3')).toEqual({ title: null, author: null, coverPath: null });
    expect(reads.some((read) => read.position == null)).toBe(true);
    await expect(readEpubMetadata('content://books/gone.epub', 'b4')).rejects.toThrow(/No file/);
  });
});
