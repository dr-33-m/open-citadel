/**
 * What the reader can do to what Samwell has kept: forget a piece of it (and
 * take that back), put it in their own words, or forget all of it.
 *
 * Forgetting hands back the row it removed, so the screen can offer an undo
 * that restores it exactly: same id, same kind, same chat it came from.
 * Nothing here invalidates the query; the screen's mutation does, once.
 */
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { journeyNotes, samwellProfile } from '@/db/schema';

const PROFILE_ROW = 1;

export type ForgottenNote = typeof journeyNotes.$inferSelect;
export type ForgottenProfile = typeof samwellProfile.$inferSelect;

export function forgetNote(id: string): ForgottenNote | null {
  return db.transaction(() => {
    const row = db.select().from(journeyNotes).where(eq(journeyNotes.id, id)).get() ?? null;
    if (row) db.delete(journeyNotes).where(eq(journeyNotes.id, id)).run();
    return row;
  });
}

export function restoreNote(row: ForgottenNote): void {
  db.insert(journeyNotes).values(row).onConflictDoNothing().run();
}

/** Their words in place of his. The note keeps its kind, date and source. */
export function correctNote(id: string, text: string): void {
  db.update(journeyNotes).set({ text }).where(eq(journeyNotes.id, id)).run();
}

export function forgetProfile(): ForgottenProfile | null {
  return db.transaction(() => {
    const row = db.select().from(samwellProfile).where(eq(samwellProfile.id, PROFILE_ROW)).get() ?? null;
    db.delete(samwellProfile).run();
    return row;
  });
}

export function restoreProfile(row: ForgottenProfile): void {
  db.insert(samwellProfile).values(row).onConflictDoNothing().run();
}

export function correctProfile(text: string): void {
  const values = { text, updatedAt: new Date().toISOString() };
  db.insert(samwellProfile)
    .values({ id: PROFILE_ROW, ...values })
    .onConflictDoUpdate({ target: samwellProfile.id, set: values })
    .run();
}

export function forgetEverything(): void {
  db.transaction(() => {
    db.delete(journeyNotes).run();
    db.delete(samwellProfile).run();
  });
}
