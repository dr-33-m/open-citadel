import { inflateRaw } from 'pako';

import { utf8Decode } from '@/utils/bytes';

/** Reads `length` bytes from `position` of the archive. */
export type ReadRange = (position: number, length: number) => Promise<Uint8Array>;

/** An archive read a piece at a time: only the entries asked for are ever fetched. */
export interface RangedZip {
  has(name: string): boolean;
  /** The entry's contents, or null when there is no such entry. */
  bytes(name: string): Promise<Uint8Array | null>;
  /** The entry as UTF-8 text, or null when there is no such entry. */
  text(name: string): Promise<string | null>;
}

interface Entry {
  method: number;
  flags: number;
  compressedSize: number;
  headerOffset: number;
}

const END_OF_DIRECTORY = 0x06054b50;
const DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;
const END_LENGTH = 22;
const LONGEST_COMMENT = 0xffff;
const LOCAL_HEADER_LENGTH = 30;

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/**
 * Opens a ZIP by its directory alone: the end record from the last few
 * kilobytes, then the central directory it points at. An entry's bytes are
 * read, and inflated, only when asked for.
 *
 * Written for EPUBs. Taking a book's title, author and cover used to read the
 * whole file into a base64 string and hand it to JSZip, which decodes every
 * byte of it on the JavaScript thread: tens of megabytes per book, for two
 * small XML files and one image, and seconds of a frozen app on a Galaxy A33
 * while a folder synced. This reads those three entries and nothing else.
 *
 * Throws on what it does not read (ZIP64, encryption, a method other than
 * stored or deflate, a damaged directory), so the caller can fall back to
 * reading the file whole.
 */
export async function openRangedZip(size: number, read: ReadRange): Promise<RangedZip> {
  const tailLength = Math.min(size, END_LENGTH + LONGEST_COMMENT);
  const tailStart = size - tailLength;
  const tail = await read(tailStart, tailLength);
  const tailView = view(tail);

  let end = -1;
  for (let at = tail.length - END_LENGTH; at >= 0; at--) {
    if (tailView.getUint32(at, true) === END_OF_DIRECTORY) {
      end = at;
      break;
    }
  }
  if (end < 0) throw new Error('Not a ZIP: no end of central directory');

  const count = tailView.getUint16(end + 10, true);
  const directorySize = tailView.getUint32(end + 12, true);
  const directoryOffset = tailView.getUint32(end + 16, true);
  if (count === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    throw new Error('ZIP64 is not read in pieces');
  }
  if (directoryOffset + directorySize > size) throw new Error('Central directory runs past the end of the file');

  const directory =
    directoryOffset >= tailStart
      ? tail.subarray(directoryOffset - tailStart, directoryOffset - tailStart + directorySize)
      : await read(directoryOffset, directorySize);
  const directoryView = view(directory);

  const entries = new Map<string, Entry>();
  let at = 0;
  for (let index = 0; index < count; index++) {
    if (at + 46 > directory.length || directoryView.getUint32(at, true) !== DIRECTORY_ENTRY) {
      throw new Error('Damaged central directory');
    }
    const nameLength = directoryView.getUint16(at + 28, true);
    const extraLength = directoryView.getUint16(at + 30, true);
    const commentLength = directoryView.getUint16(at + 32, true);
    const name = utf8Decode(directory.subarray(at + 46, at + 46 + nameLength));
    entries.set(name, {
      flags: directoryView.getUint16(at + 8, true),
      method: directoryView.getUint16(at + 10, true),
      compressedSize: directoryView.getUint32(at + 20, true),
      headerOffset: directoryView.getUint32(at + 42, true),
    });
    at += 46 + nameLength + extraLength + commentLength;
  }

  const bytes = async (name: string): Promise<Uint8Array | null> => {
    const entry = entries.get(name);
    if (!entry) return null;
    if (entry.flags & 1) throw new Error(`${name} is encrypted`);
    // The local header's own name and extra field can differ in length from
    // the directory's, so it is read for where the data starts.
    const header = await read(entry.headerOffset, LOCAL_HEADER_LENGTH);
    const headerView = view(header);
    if (header.length < LOCAL_HEADER_LENGTH || headerView.getUint32(0, true) !== LOCAL_HEADER) {
      throw new Error(`No local header for ${name}`);
    }
    const dataStart = entry.headerOffset + LOCAL_HEADER_LENGTH + headerView.getUint16(26, true) + headerView.getUint16(28, true);
    const data = entry.compressedSize > 0 ? await read(dataStart, entry.compressedSize) : new Uint8Array(0);
    if (entry.method === 0) return data;
    if (entry.method === 8) return inflateRaw(data);
    throw new Error(`${name} uses compression method ${entry.method}`);
  };

  return {
    has: (name) => entries.has(name),
    bytes,
    text: async (name) => {
      const content = await bytes(name);
      return content ? utf8Decode(content) : null;
    },
  };
}
