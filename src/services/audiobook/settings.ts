/**
 * What the audiobook keeps between runs, in `app_settings`: the book in the
 * mini player and where, each voice's learned pace, which voice each book
 * was last heard in (the Listen sheet shows again when it changes), and the
 * clock each book last showed.
 */
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { appSettings } from '@/db/schema';
import { NO_PACE, type PaceStats } from '@/features/audiobook/utils/book-clock';

const CURRENT = 'audiobook.current';
const paceKey = (modelId: string, voice: string) => `audiobook.pace.${modelId}.${voice}`;
const heardKey = (bookId: string) => `audiobook.heard.${bookId}`;
const clockKey = (bookId: string) => `audiobook.clock.${bookId}`;

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
}

export function readCurrent(): StoredCurrent | null {
  const value = readJson<StoredCurrent>(CURRENT);
  return value && typeof value.bookId === 'string' && typeof value.sentenceId === 'string' ? value : null;
}

export function writeCurrent(value: StoredCurrent | null): void {
  if (value) write(CURRENT, JSON.stringify(value));
  else db.delete(appSettings).where(eq(appSettings.key, CURRENT)).run();
}

export function readPace(modelId: string, voice: string): PaceStats {
  const value = readJson<PaceStats>(paceKey(modelId, voice));
  return value && value.chars > 0 && value.sec > 0 ? value : NO_PACE;
}

export function writePace(modelId: string, voice: string, stats: PaceStats): void {
  write(paceKey(modelId, voice), JSON.stringify(stats));
}

/** The voice a book was last heard in (`cloud:<model>:<voice>`), or null for a book never heard. */
export function readHeardVoice(bookId: string): string | null {
  return read(heardKey(bookId));
}

export function writeHeardVoice(bookId: string, voiceKey: string): void {
  write(heardKey(bookId), voiceKey);
}

/**
 * The clock a book last showed, at the sentence it was left at and in the
 * voice it was heard in: what the player draws when the book starts again
 * there, before it has been read and laid out. Kept through a stop, as the
 * book's saved place is.
 */
export interface HeardClock {
  voiceKey: string;
  sentenceId: string;
  /** The sentence's words: a saved place written by listening carries them, one written by the reader does not. */
  sentenceText: string;
  positionSec: number;
  durationSec: number;
  chapterTitle: string | null;
  /** Left at the book's last sentence: heard to the end, so it starts again from the top, and opens on no clock. */
  ended?: boolean;
  /** The pace the clock was laid out by (`steadyPace`), for the next session to go on from it. */
  clockPace: number | null;
}

export function readHeardClock(bookId: string): HeardClock | null {
  const value = readJson<HeardClock>(clockKey(bookId));
  return value && typeof value.sentenceId === 'string' && value.durationSec > 0 ? value : null;
}

export function writeHeardClock(bookId: string, clock: HeardClock): void {
  write(clockKey(bookId), JSON.stringify(clock));
}
