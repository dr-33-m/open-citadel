import { EncodingType, getInfoAsync, readAsStringAsync } from 'expo-file-system/legacy';
import JSZip from 'jszip';

import { openRangedZip } from '@/services/ranged-zip';
import { base64ToBytes, utf8Decode } from '@/utils/bytes';

/** An EPUB opened for reading entries by name. */
export interface EpubArchive {
  /** Every file in it, directories left out. */
  names(): string[];
  text(name: string): Promise<string | null>;
  bytes(name: string): Promise<Uint8Array | null>;
  /** Several entries as text, fetched together where they sit together. Missing names are left out. */
  textMany(names: readonly string[]): Promise<Map<string, string>>;
}

/** The book's file could not be read at all, as opposed to read and found wanting. */
export class UnreadableBook extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'UnreadableBook';
  }
}

/**
 * A stored book path as a URI the file APIs take. Android's reader takes a
 * path with no scheme for the name of a bundled resource, so every book kept
 * in the app's own folder failed to read until it was given its scheme.
 */
export function bookUri(filePath: string): string {
  return filePath.startsWith('/') ? `file://${filePath}` : filePath;
}

/**
 * Opens an EPUB, reading only the entries asked for (`openRangedZip`): its
 * directory and then each entry as it is wanted, so a chapter costs a
 * chapter and not the whole book read into memory and decoded on the
 * JavaScript thread. A ZIP the ranged reader declines (ZIP64, encryption, a
 * damaged directory), or a file whose size cannot be learned, is read whole
 * through JSZip as it always was.
 *
 * Throws `UnreadableBook` when the file cannot be read, and the parse error
 * itself when it was read and is not an EPUB.
 */
export async function openEpub(filePath: string): Promise<EpubArchive> {
  const uri = bookUri(filePath);
  const info = await getInfoAsync(uri).catch(() => null);
  const size = info?.exists ? ((info as { size?: number }).size ?? 0) : 0;
  if (size > 0) {
    try {
      const zip = await openRangedZip(size, async (position, length) =>
        base64ToBytes(await readAsStringAsync(uri, { encoding: EncodingType.Base64, position, length })),
      );
      // Asked for on every lookup (`findEntry`), so made once.
      const files = zip.names().filter((name) => !name.endsWith('/'));
      return {
        names: () => files,
        text: zip.text,
        bytes: zip.bytes,
        textMany: async (names) => {
          const found = await zip.bytesMany(names);
          const texts = new Map<string, string>();
          for (const [name, content] of found) {
            texts.set(name, utf8Decode(content));
            // A chapter decoded at a time, with the screen drawn in between.
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
          return texts;
        },
      };
    } catch (e) {
      console.warn('[book-text] could not read in pieces, reading the whole file:', e);
    }
  }
  let base64: string;
  try {
    base64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
  } catch (e) {
    throw new UnreadableBook(e);
  }
  return jszipArchive(await JSZip.loadAsync(base64, { base64: true }));
}

/** A whole archive JSZip has already read, behind the same face. */
export function jszipArchive(zip: JSZip): EpubArchive {
  return {
    names: () => Object.keys(zip.files).filter((name) => !zip.files[name].dir),
    text: async (name) => (await zip.file(name)?.async('string')) ?? null,
    bytes: async (name) => (await zip.file(name)?.async('uint8array')) ?? null,
    textMany: async (names) => {
      const found = new Map<string, string>();
      for (const name of new Set(names)) {
        const content = await zip.file(name)?.async('string');
        if (content != null) found.set(name, content);
      }
      return found;
    },
  };
}

/** Where the package file is, from `META-INF/container.xml`. */
export async function opfPathOf(archive: EpubArchive): Promise<string | null> {
  const container = await archive.text('META-INF/container.xml');
  return container?.match(/full-path="([^"]+)"/)?.[1] ?? null;
}

/** The folder the package file sits in, which every manifest path is relative to. */
export function opfFolder(opfPath: string): string {
  const at = opfPath.lastIndexOf('/');
  return at >= 0 ? opfPath.slice(0, at + 1) : '';
}

/**
 * The archive entry an href names: as given, then under the package folder,
 * then by file name alone, which is how readers' locators and odd manifests
 * have to be met.
 */
export function findEntry(archive: EpubArchive, href: string, folder: string): string | null {
  const names = archive.names();
  const exact = [folder + href, href].find((candidate) => names.includes(candidate));
  if (exact) return exact;
  const base = href.split('/').pop() ?? '';
  return base ? (names.find((name) => name.endsWith(`/${base}`) || name === base) ?? null) : null;
}
