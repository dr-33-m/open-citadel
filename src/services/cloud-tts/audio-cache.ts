/**
 * Cloud audio kept on the phone, so nothing is paid for twice.
 *
 * Every piece read in a cloud voice is written here as the raw 16-bit PCM the
 * server sent, keyed by book, text, model and voice
 * (`cache-key.ts`). Going back a sentence, or reading a chapter again, plays
 * from here and never reaches the server. Nothing in it is shared: it lives
 * in this app's cache folder and leaves with the app.
 *
 * Kept as it came: MP3 where the native player decodes it (about a tenth of
 * the size of PCM), raw 16-bit PCM otherwise, which is half the size of the
 * Float32 the player takes and a few milliseconds a sentence to turn back.
 * PCM at 24 kHz is about 173 MB an hour; MP3, about 15 to 20.
 *
 * Capped at about 300 MB, oldest-used out first, which holds well over an
 * hour and a half of listening: enough for going back and for a chapter read
 * twice, which is what it is for. The OS
 * may clear the cache folder under storage pressure, and that is fine; the
 * index below forgets any file it finds missing.
 *
 * The index (size and last use per piece) is one small JSON file, loaded
 * once and written back a moment after it changes rather than on every
 * sentence.
 */
import { Directory, File, Paths } from 'expo-file-system';

import { PcmDecoder } from '@/services/cloud-tts/pcm';
import type { AudioEncoding } from '@/services/cloud-tts/request';

const CAP_BYTES = 300 * 1024 * 1024;
/** Evict down to this, so a full cache is not trimmed again on the very next piece. */
const TRIM_TO_BYTES = 270 * 1024 * 1024;
const INDEX_WRITE_DELAY_MS = 2_000;

interface Entry {
  bytes: number;
  sampleRate: number;
  channels: number;
  /** Absent on entries written before MP3, which are all PCM. */
  kind?: AudioEncoding;
  usedAt: number;
}

let folder: Directory | null = null;
let index: Map<string, Entry> | null = null;
let indexTimer: ReturnType<typeof setTimeout> | null = null;

function cacheFolder(): Directory {
  if (!folder) {
    folder = new Directory(Paths.cache, 'cloud-voices');
    if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
  }
  return folder;
}

function indexFile(): File {
  return new File(cacheFolder(), 'index.json');
}

function pieceFile(key: string, kind: AudioEncoding = 'pcm'): File {
  return new File(cacheFolder(), `${key}.${kind}`);
}

async function loadIndex(): Promise<Map<string, Entry>> {
  if (index) return index;
  const loaded = new Map<string, Entry>();
  try {
    const file = indexFile();
    if (file.exists) {
      const raw = JSON.parse(await file.text()) as Record<string, Entry>;
      for (const [key, entry] of Object.entries(raw)) {
        if (entry && typeof entry.bytes === 'number' && typeof entry.sampleRate === 'number') {
          loaded.set(key, entry);
        }
      }
    }
  } catch {
    // An unreadable index costs the cache, never the reader: start empty and
    // let the files it no longer names be trimmed as they are overwritten.
  }
  index ??= loaded;
  return index;
}

function scheduleIndexWrite(): void {
  if (indexTimer) return;
  indexTimer = setTimeout(() => {
    indexTimer = null;
    if (!index) return;
    try {
      indexFile().write(JSON.stringify(Object.fromEntries(index)));
    } catch {
      // Next change tries again.
    }
  }, INDEX_WRITE_DELAY_MS);
}

export type CachedPiece =
  | { kind: 'pcm'; samples: Float32Array; sampleRate: number }
  | { kind: 'mp3'; bytes: Uint8Array };

/**
 * A piece played before, or null. Marks it used, so it is the last to go.
 * An MP3 piece is a miss where MP3 cannot be played (`canPlayMp3`).
 */
export async function readCachedPiece(key: string, canPlayMp3 = true): Promise<CachedPiece | null> {
  const entries = await loadIndex();
  const entry = entries.get(key);
  if (!entry) return null;
  const kind = entry.kind ?? 'pcm';
  if (kind === 'mp3' && !canPlayMp3) return null;
  try {
    const file = pieceFile(key, kind);
    if (!file.exists) {
      entries.delete(key);
      scheduleIndexWrite();
      return null;
    }
    const bytes = await file.bytes();
    entry.usedAt = Date.now();
    scheduleIndexWrite();
    if (kind === 'mp3') return { kind, bytes };
    return { kind, samples: new PcmDecoder(entry.channels ?? 1).push(bytes), sampleRate: entry.sampleRate };
  } catch {
    return null;
  }
}

/** Keep a piece that has just been heard whole. Never throws: a full disk only means no cache. */
export async function writeCachedPiece(
  key: string,
  chunks: Uint8Array[],
  format: { kind: AudioEncoding; sampleRate: number; channels: number },
): Promise<void> {
  const length = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  if (length === 0) return;
  try {
    const joined = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const entries = await loadIndex();
    const previous = entries.get(key);
    // The same piece saved before in the other format: its file goes too.
    if (previous && (previous.kind ?? 'pcm') !== format.kind) {
      const stale = pieceFile(key, previous.kind ?? 'pcm');
      if (stale.exists) stale.delete();
    }
    pieceFile(key, format.kind).write(joined);
    entries.set(key, { bytes: length, ...format, usedAt: Date.now() });
    trim(entries);
    scheduleIndexWrite();
  } catch {
    // Storage full or the folder cleared underneath us: the audio still played.
  }
}

/** Oldest-used out until the cache is back under the trim line. */
function trim(entries: Map<string, Entry>): void {
  let total = 0;
  for (const entry of entries.values()) total += entry.bytes;
  if (total <= CAP_BYTES) return;
  const oldestFirst = [...entries.entries()].sort((a, b) => a[1].usedAt - b[1].usedAt);
  for (const [key, entry] of oldestFirst) {
    if (total <= TRIM_TO_BYTES) break;
    try {
      const file = pieceFile(key, entry.kind ?? 'pcm');
      if (file.exists) file.delete();
    } catch {
      // Gone already, or busy: forgotten either way.
    }
    entries.delete(key);
    total -= entry.bytes;
  }
}
