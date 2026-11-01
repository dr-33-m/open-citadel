/**
 * What Samwell has kept about someone, beyond the notes `journey.ts` searches:
 * his one picture of them, their wins and open commitments, and the means to
 * read and delete all of it. Everything here is on the device.
 */
import { and, desc, eq, gte, inArray, isNull } from 'drizzle-orm';
import type { JournalNote, JournalResponse } from 'samwell-shared';

import { db } from '@/db/client';
import { chatSessions, journeyNotes, samwellProfile } from '@/db/schema';
import { queryClient } from '@/lib/query-client';
import { samwellMemoryKeys } from '@/query-manager/samwell-memory/keys';
import { listBlogs } from '@/services/listening-tools/blogs';
import { listShows } from '@/services/listening-tools/podcasts';
import { localDayString } from '@/utils/day';
import { memoryBlock } from '@/utils/samwell-memory-block';

const RECENT_WINS = 4;
const WIN_WINDOW_MS = 180 * 24 * 60 * 60_000;
const OPEN_COMMITMENTS = 5;
/** A commitment nobody has mentioned in this long is no longer one to ask about. */
const COMMITMENT_WINDOW_MS = 60 * 24 * 60 * 60_000;
const TAKING_IN = 3;
/** The most the journal is handed to close, the cap on `openCommitments`. */
const COMMITMENTS_TO_CHECK = 12;

const PROFILE_ROW = 1;

export type MemoryNote = {
  id: string;
  kind: (typeof journeyNotes.$inferSelect)['kind'];
  text: string;
  resolvedAt: string | null;
  createdAt: string;
};

export type SamwellMemory = { profile: string | null; notes: MemoryNote[] };

export function readProfile(): string | null {
  return db.select({ text: samwellProfile.text }).from(samwellProfile).where(eq(samwellProfile.id, PROFILE_ROW)).get()?.text ?? null;
}

function since(windowMs: number): string {
  return new Date(Date.now() - windowMs).toISOString();
}

export function readOpenCommitments(limit = COMMITMENTS_TO_CHECK): { id: string; text: string; dueOn: string | null }[] {
  return db
    .select({ id: journeyNotes.id, text: journeyNotes.text, dueOn: journeyNotes.dueOn })
    .from(journeyNotes)
    .where(
      and(
        eq(journeyNotes.kind, 'commitment'),
        isNull(journeyNotes.resolvedAt),
        gte(journeyNotes.createdAt, since(COMMITMENT_WINDOW_MS)),
      ),
    )
    .orderBy(desc(journeyNotes.createdAt))
    .limit(limit)
    .all();
}

function readRecentWins(): { text: string; on: string }[] {
  return db
    .select({ text: journeyNotes.text, createdAt: journeyNotes.createdAt })
    .from(journeyNotes)
    .where(
      and(
        inArray(journeyNotes.kind, ['win', 'milestone', 'goal_finished']),
        gte(journeyNotes.createdAt, since(WIN_WINDOW_MS)),
      ),
    )
    .orderBy(desc(journeyNotes.createdAt))
    .limit(RECENT_WINS)
    .all()
    .map((row) => ({ text: row.text, on: localDayString(new Date(row.createdAt)) }));
}

/** The words that go with a cloud turn. See `memoryBlock`. */
export function buildMemoryBlock(): string {
  return memoryBlock({
    profile: readProfile(),
    wins: readRecentWins(),
    commitments: readOpenCommitments(OPEN_COMMITMENTS),
    shows: listShows(undefined, false)
      .filter((show) => show.lastPlayedAt)
      .slice(0, TAKING_IN)
      .map((show) => show.title),
    blogs: listBlogs(undefined)
      .slice(0, TAKING_IN)
      .map((blog) => blog.title),
  });
}

function insertNote(note: JournalNote, sourceRef: string, createdAt: string, id: string): void {
  db.insert(journeyNotes)
    .values({
      id,
      // A server from before notes had kinds answers without one.
      kind: note.kind ?? 'reflection',
      text: note.text,
      tags: note.tags.length > 0 ? JSON.stringify(note.tags) : null,
      sourceRef,
      dueOn: note.dueOn ?? null,
      createdAt,
    })
    .run();
}

/**
 * One write-up, and the watermark, together: cut off between them, the notes
 * would be written again by the next sweep.
 */
export function commitJournalWriteUp(sessionId: string, writeUp: JournalResponse, through: string): void {
  const now = new Date().toISOString();
  db.transaction(() => {
    writeUp.notes.forEach((note, index) => {
      const id = `jn_${Date.now().toString(36)}_${index}_${Math.random().toString(36).slice(2, 10)}`;
      if (note.text.trim()) insertNote(note, `chat:${sessionId}`, now, id);
    });
    if (writeUp.resolved?.length) {
      db.update(journeyNotes).set({ resolvedAt: now }).where(inArray(journeyNotes.id, writeUp.resolved)).run();
    }
    if (writeUp.profile?.trim()) {
      const values = { text: writeUp.profile.trim(), updatedAt: now };
      db.insert(samwellProfile)
        .values({ id: PROFILE_ROW, ...values })
        .onConflictDoUpdate({ target: samwellProfile.id, set: values })
        .run();
    }
    db.update(chatSessions).set({ journaledAt: through }).where(eq(chatSessions.id, sessionId)).run();
  });
  void queryClient.invalidateQueries({ queryKey: samwellMemoryKeys.all });
}

export function readSamwellMemory(): SamwellMemory {
  return {
    profile: readProfile(),
    notes: db
      .select({
        id: journeyNotes.id,
        kind: journeyNotes.kind,
        text: journeyNotes.text,
        resolvedAt: journeyNotes.resolvedAt,
        createdAt: journeyNotes.createdAt,
      })
      .from(journeyNotes)
      .orderBy(desc(journeyNotes.createdAt))
      .all(),
  };
}

export function forgetNote(id: string): void {
  db.delete(journeyNotes).where(eq(journeyNotes.id, id)).run();
}

export function forgetProfile(): void {
  db.delete(samwellProfile).run();
}

export function forgetEverything(): void {
  db.transaction(() => {
    db.delete(journeyNotes).run();
    db.delete(samwellProfile).run();
  });
}
