import { inflateRaw } from 'pako';

import { utf8Decode } from '@/utils/bytes';

/** Reads `length` bytes from `position` of the archive. */
export type ReadRange = (position: number, length: number) => Promise<Uint8Array>;

/** An archive read a piece at a time: only the entries asked for are ever fetched. */
export interface RangedZip {
  /** Every entry's name, directories included. */
  names(): string[];
  has(name: string): boolean;
  /** The entry's contents, or null when there is no such entry. */
  bytes(name: string): Promise<Uint8Array | null>;
  /** The entry as UTF-8 text, or null when there is no such entry. */
  text(name: string): Promise<string | null>;
  /**
   * Several entries at once, read in as few passes over the file as their
   * places allow: entries stored side by side (a book's chapters, usually)
   * come in one read. Names with no entry are left out of the answer.
   */
  bytesMany(names: readonly string[]): Promise<Map<string, Uint8Array>>;
}

interface Entry {
  method: number;
  flags: number;
  compressedSize: number;
  headerOffset: number;
  /** The directory's lengths for the name and extra field, which the local header usually repeats. */
  nameLength: number;
  extraLength: number;
}

const END_OF_DIRECTORY = 0x06054b50;
const DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;
const END_LENGTH = 22;
const LONGEST_COMMENT = 0xffff;
const LOCAL_HEADER_LENGTH = 30;
/**
 * Room for a local extra field longer than the directory's, so an entry
 * usually takes one read rather than a header read and a data read.
 */
const LOCAL_SLACK = 512;
/** Entries closer than this are read together: skipping a gap costs a read, reading through it costs only bytes. */
const MERGE_GAP = 64 * 1024;
/**
 * Most one batched read may span, whatever the gaps. Each read comes back as
 * base64 decoded on the JavaScript thread in one go, so this is also the
 * longest piece of that work the screen waits on.
 */
const LONGEST_RUN = 2 * 1024 * 1024;

/** A turn of the event loop, so a batch of entries is unpacked in pieces the screen can draw between. */
const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

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
      nameLength,
      extraLength,
    });
    at += 46 + nameLength + extraLength + commentLength;
  }

  /** How far past its header an entry's data probably ends, slack included, inside the file. */
  const spanEnd = (entry: Entry) =>
    Math.min(size, entry.headerOffset + LOCAL_HEADER_LENGTH + entry.nameLength + entry.extraLength + entry.compressedSize + LOCAL_SLACK);

  /**
   * An entry's contents out of a buffer read from `bufferStart`, or null when
   * the buffer stops short of them (a local extra field longer than the slack).
   */
  const unpack = (name: string, entry: Entry, buffer: Uint8Array, bufferStart: number): Uint8Array | null => {
    const at = entry.headerOffset - bufferStart;
    if (at < 0 || at + LOCAL_HEADER_LENGTH > buffer.length) return null;
    const headerView = view(buffer.subarray(at, at + LOCAL_HEADER_LENGTH));
    if (headerView.getUint32(0, true) !== LOCAL_HEADER) throw new Error(`No local header for ${name}`);
    const dataStart = at + LOCAL_HEADER_LENGTH + headerView.getUint16(26, true) + headerView.getUint16(28, true);
    const dataEnd = dataStart + entry.compressedSize;
    if (dataEnd > buffer.length) return null;
    const data = buffer.subarray(dataStart, dataEnd);
    if (entry.method === 0) return data;
    if (entry.method === 8) return inflateRaw(data);
    throw new Error(`${name} uses compression method ${entry.method}`);
  };

  const wanted = (name: string): Entry | null => {
    const entry = entries.get(name);
    if (!entry) return null;
    if (entry.flags & 1) throw new Error(`${name} is encrypted`);
    return entry;
  };

  const bytes = async (name: string): Promise<Uint8Array | null> => {
    const entry = wanted(name);
    if (!entry) return null;
    const buffer = await read(entry.headerOffset, spanEnd(entry) - entry.headerOffset);
    const found = unpack(name, entry, buffer, entry.headerOffset);
    if (found) return found;
    // The local header's extra field outgrew the slack: read again, as long as it says.
    const header = view(buffer.subarray(0, LOCAL_HEADER_LENGTH));
    const length = LOCAL_HEADER_LENGTH + header.getUint16(26, true) + header.getUint16(28, true) + entry.compressedSize;
    const again = unpack(name, entry, await read(entry.headerOffset, Math.min(length, size - entry.headerOffset)), entry.headerOffset);
    if (!again) throw new Error(`${name} runs past the end of the file`);
    return again;
  };

  const bytesMany = async (names: readonly string[]): Promise<Map<string, Uint8Array>> => {
    const found = new Map<string, Uint8Array>();
    const queue = [...new Set(names)]
      .map((name) => ({ name, entry: wanted(name) }))
      .filter((item): item is { name: string; entry: Entry } => item.entry !== null)
      .sort((a, b) => a.entry.headerOffset - b.entry.headerOffset);
    // Runs of entries near enough to read together.
    const runs: { start: number; end: number; items: typeof queue }[] = [];
    for (const item of queue) {
      const end = spanEnd(item.entry);
      const run = runs[runs.length - 1];
      if (run && item.entry.headerOffset - run.end <= MERGE_GAP && end - run.start <= LONGEST_RUN) {
        run.end = Math.max(run.end, end);
        run.items.push(item);
      } else {
        runs.push({ start: item.entry.headerOffset, end, items: [item] });
      }
    }
    for (const run of runs) {
      const buffer = await read(run.start, run.end - run.start);
      for (const { name, entry } of run.items) {
        await breathe();
        const content = unpack(name, entry, buffer, run.start) ?? (await bytes(name));
        if (content) found.set(name, content);
      }
    }
    return found;
  };

  return {
    names: () => [...entries.keys()],
    has: (name) => entries.has(name),
    bytes,
    bytesMany,
    text: async (name) => {
      const content = await bytes(name);
      return content ? utf8Decode(content) : null;
    },
  };
}
