/**
 * What the audiobook keeps between runs, in `app_settings`: the book in the
 * mini player and where, each voice's learned pace, and which voice each book
 * was last heard in (the Listen sheet shows again when it changes).
 */
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { appSettings } from '@/db/schema';
import { NO_PACE, type PaceStats } from '@/features/audiobook/utils/book-clock';

const CURRENT = 'audiobook.current';
const paceKey = (modelId: string, voice: string) => `audiobook.pace.${modelId}.${voice}`;
const heardKey = (bookId: string) => `audiobook.heard.${bookId}`;

function read(key: string): string | null {
  return db.select().from(appSettings).where(eq(appSettings.key, key)).get()?.value ?? null;
}

function write(key: string, value: string): void {
  db.insert(appSettings).values({ key, value }).onConflictDoUpdate({ target: appSettings.key, set: { value } }).run();
}

function readJson<T>(key: string): T | null {
  const raw = read(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export interface StoredCurrent {
  bookId: string;
  sentenceId: string;
  /** When it was heard (ms), to compare with where read-aloud got to since. */
  at?: number;
}

export function readCurrent(): StoredCurrent | null {
  const value = readJson<StoredCurrent>(CURRENT);
  return value && typeof value.bookId === 'string' && typeof value.sentenceId === 'string' ? value : null;
}

export function writeCurrent(value: StoredCurrent | null): void {
  if (value) write(CURRENT, JSON.stringify({ ...value, at: Date.now() }));
  else db.delete(appSettings).where(eq(appSettings.key, CURRENT)).run();
}

export function readPace(modelId: string, voice: string): PaceStats {
  const value = readJson<PaceStats>(paceKey(modelId, voice));
  return value && value.chars > 0 && value.sec > 0 ? value : NO_PACE;
}

export function writePace(modelId: string, voice: string, stats: PaceStats): void {
  write(paceKey(modelId, voice), JSON.stringify(stats));
}

/** The sentence read-aloud in the reader last began in a book also heard in the player. */
export interface ReadAloudPlace {
  /** The section's file, as a reader locator names it. */
  href: string;
  text: string;
  at: number;
}

const readAloudKey = (bookId: string) => `audiobook.readAloud.${bookId}`;

export function readReadAloudPlace(bookId: string): ReadAloudPlace | null {
  const value = readJson<ReadAloudPlace>(readAloudKey(bookId));
  return value && typeof value.href === 'string' && typeof value.text === 'string' && typeof value.at === 'number' ? value : null;
}

/**
 * Read-aloud began a sentence in the reader. Kept only for a book that has
 * been heard in the player, so pressing play there goes on from it.
 */
export function noteReadAloud(bookId: string, href: string, text: string): void {
  if (!readHeardVoice(bookId) || !text.trim()) return;
  write(readAloudKey(bookId), JSON.stringify({ href, text, at: Date.now() }));
}

/** The voice a book was last heard in (`cloud:<model>:<voice>`), or null for a book never heard. */
export function readHeardVoice(bookId: string): string | null {
  return read(heardKey(bookId));
}

export function writeHeardVoice(bookId: string, voiceKey: string): void {
  write(heardKey(bookId), voiceKey);
}
