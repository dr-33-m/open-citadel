import { and, desc, eq, gte, inArray, isNotNull, ne } from 'drizzle-orm';

import { db } from '@/db/client';
import {
  books,
  goals,
  highlights,
  journeyNotes,
  readingProgress,
  trackableLogs,
  trackables,
} from '@/db/schema';
import { extractKeywords } from '@/services/compass-reading-rank';
import { addDaysYmd, localDayString } from '@/utils/day';

/**
 * Journey memory, the arc of the user's reading and execution, synthesized
 * on-device from data that already lives here (finished books, highlight tags,
 * Compass history) plus a small store of distilled reflections.
 *
 * Two shapes, deliberately: the SNAPSHOT is orientation and rides along with
 * every cloud turn, because knowing who they are should never cost a round
 * trip. The NOTES are detail and are fetched on demand through the
 * `search_journey` tool, because handing over every reflection someone has
 * ever had, on the chance one is relevant, is how a context window is wasted.
 *
 * Only the slice actually used travels with a request the user is already
 * making. Nothing new is stored off-device.
 */

const MAX_SNAPSHOT_CHARS = 1600;
/** Five notes at their longest (a goal note carries a 320-char takeaway). */
const MAX_NOTES_CHARS = 2000;
const RECENT_FINISHED = 6;
/** The books most recently opened. Someone with thirty half-read books would
 *  otherwise spend the whole snapshot listing them. */
const RECENT_READING = 5;
/** Several goals can be active at once; the main one is listed first. */
const MAX_ACTIVE_GOALS = 3;
/** How far back the snapshot looks to say whether the work is happening. */
const RECENT_LOG_DAYS = 14;
const TOP_TAGS = 8;
/**
 * How many notes are considered, and how many come back.
 *
 * The pool is wide on purpose. It was 80, which at a few notes a week put
 * anything older than a few months out of reach, and "something you noticed
 * months ago" is exactly what the tool is for. Notes are a few hundred
 * characters each, so reading hundreds of them on-device costs nothing.
 */
const JOURNEY_NOTE_POOL = 1000;
const JOURNEY_NOTE_RESULTS = 5;

/**
 * Whole lines, in order, until the budget runs out.
 *
 * A raw `slice` cut the snapshot mid-line, so the last thing the model read
 * could be half a goal title or a percentage with its digits missing. Losing
 * the last line entirely is better than handing over a wrong one.
 */
export function fitLines(lines: string[], maxChars: number): string {
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    const cost = line.length + (kept.length > 0 ? 1 : 0);
    if (used + cost > maxChars) break;
    kept.push(line);
    used += cost;
  }
  return kept.join('\n');
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

function topHighlightTags(limit: number): string[] {
  // Runs ahead of every cloud turn, synchronously, so untagged highlights
  // (most of them) are left in SQLite rather than parsed to find nothing.
  const rows = db
    .select({ tags: highlights.tags })
    .from(highlights)
    .where(and(isNotNull(highlights.tags), ne(highlights.tags, '[]'), ne(highlights.tags, '')))
    .all();
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const tag of parseTags(row.tags)) {
      const key = tag.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag]) => tag);
}

/**
 * Deterministic synthesis of the journey from existing local data. No LLM.
 * Returns a compact, token-bounded text block.
 *
 * `includeCompass` (default true) gates the goal/milestone/focus-score
 * lines. Compass is a paid, cloud-only feature — offline chat sessions must
 * not get its analysis output for free via journey context, so callers on
 * the offline path pass `includeCompass: false`.
 */
export function buildJourneySnapshot(options?: { includeCompass?: boolean }): string {
  const includeCompass = options?.includeCompass ?? true;
  const lines: string[] = [];

  const finished = db
    .select({
      title: books.title,
      author: books.author,
      category: books.category,
    })
    .from(books)
    .where(eq(books.status, 'archived'))
    .orderBy(desc(books.completedAt))
    .limit(RECENT_FINISHED)
    .all();
  if (finished.length > 0) {
    lines.push(
      'Recently finished: ' +
        finished
          .map((b) => `"${b.title}" by ${b.author}${b.category ? ` (${b.category})` : ''}`)
          .join('; '),
    );
  }

  const reading = db
    .select({
      title: books.title,
      author: books.author,
      percentage: readingProgress.percentage,
    })
    .from(books)
    .leftJoin(readingProgress, eq(readingProgress.bookId, books.id))
    .where(eq(books.status, 'reading'))
    .orderBy(desc(readingProgress.updatedAt))
    .limit(RECENT_READING)
    .all();
  if (reading.length > 0) {
    lines.push(
      'Currently reading: ' +
        reading
          .map(
            (b) =>
              `"${b.title}" by ${b.author}` +
              (b.percentage != null ? ` (${Math.round(b.percentage * 100)}%)` : ''),
          )
          .join('; '),
    );
  }

  const tags = topHighlightTags(TOP_TAGS);
  if (tags.length > 0) {
    lines.push('Themes they return to (from tagged highlights): ' + tags.join(', '));
  }

  if (includeCompass) {
    // Every active goal, the main one first. This used to take whichever
    // single ACTIVE row SQLite returned, so with two goals running Samwell
    // could be oriented to the side goal and never hear about the main one.
    const active = db
      .select()
      .from(goals)
      .where(eq(goals.status, 'ACTIVE'))
      .orderBy(desc(goals.isPrimary), desc(goals.createdAt))
      .limit(MAX_ACTIVE_GOALS)
      .all();
    const since = addDaysYmd(localDayString(), -RECENT_LOG_DAYS);

    for (const goal of active) {
      const label = goal.isPrimary ? 'Main goal' : 'Active goal';
      lines.push(`${label}: ${goal.title} (through ${goal.endDate})`);

      const tracked = db
        .select({ title: trackables.title })
        .from(trackables)
        .where(and(eq(trackables.goalId, goal.id), eq(trackables.status, 'ACTIVE')))
        .all();
      if (tracked.length > 0) {
        lines.push('  Tracking: ' + tracked.map((t) => t.title).join('; '));
      }

      // Deliberately a count of recent logs rather than a score. There is no
      // focus score in this model, and no streak either — the snapshot's job
      // is to say whether the work is happening lately, not to grade it.
      const recent = db
        .select({ completed: trackableLogs.completed })
        .from(trackableLogs)
        .innerJoin(trackables, eq(trackableLogs.trackableId, trackables.id))
        .where(and(eq(trackables.goalId, goal.id), gte(trackableLogs.date, since)))
        .all();
      if (recent.length > 0) {
        const done = recent.filter((r) => r.completed !== 0).length;
        const missed = recent.length - done;
        lines.push(
          `  Last ${RECENT_LOG_DAYS} days: ${done} logged done` +
            (missed > 0 ? `, ${missed} logged as missed` : ''),
        );
      }
    }
  }

  return fitLines(lines, MAX_SNAPSHOT_CHARS);
}

/**
 * The reflections Samwell has distilled, ranked against what is being
 * discussed.
 *
 * This closes a loop that was open: `saveJourneyReflection` (from an approved
 * Compass adjustment) and `saveBookFinishedNote` both write here, and until
 * this existed nothing read them back. A note worth handing someone in two
 * months is worthless if the only thing that can retrieve it is a `SELECT`
 * nobody runs.
 *
 * Keyword-ranked rather than semantic: the notes are few and short, the
 * device has no embedding index, and a keyword hit on someone's own words is
 * a good enough match at this size. Falls back to the most recent when
 * nothing scores, since "what has he been noticing lately" is a fair reading
 * of a vague question.
 */
export function searchJourneyNotes(query: string, limit = JOURNEY_NOTE_RESULTS): JourneyNote[] {
  const notes = db
    .select({
      text: journeyNotes.text,
      kind: journeyNotes.kind,
      tags: journeyNotes.tags,
      createdAt: journeyNotes.createdAt,
    })
    .from(journeyNotes)
    .orderBy(desc(journeyNotes.createdAt))
    .limit(JOURNEY_NOTE_POOL)
    .all();
  return rankJourneyNotes(notes, query, limit);
}

/**
 * The ranking half of `searchJourneyNotes`, pure so it can be tested.
 * `notes` must arrive newest first.
 *
 * A keyword matches the start of a word, not anywhere inside one: a raw
 * substring test had "art" hitting "started" and "run" hitting "brunch", so
 * a noisy note could outrank the one that was actually about the subject.
 * Prefix rather than exact keeps "habit" finding "habits".
 *
 * The chosen few go back out newest first, because that is what
 * `formatJourneyNotes` tells the model they are, and a list labelled
 * chronological but sorted by score reads as a timeline that is wrong.
 */
export function rankJourneyNotes(
  notes: JourneyNote[],
  query: string,
  limit = JOURNEY_NOTE_RESULTS,
): JourneyNote[] {
  if (notes.length === 0) return [];

  const keywords = extractKeywords(query);
  if (keywords.length === 0) return notes.slice(0, limit);

  const scored = notes
    .map((note, index) => {
      const words = extractKeywords(`${note.text} ${parseTags(note.tags).join(' ')}`);
      const score = keywords.reduce(
        (sum, k) => sum + (words.some((w) => w.startsWith(k)) ? 1 : 0),
        0,
      );
      return { note, index, score };
    })
    .filter((entry) => entry.score > 0)
    // Best match first; among equals, the newer note (lower index) wins.
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.note);

  return scored.length > 0 ? scored : notes.slice(0, limit);
}

export type JourneyNote = {
  text: string;
  kind: (typeof journeyNotes.$inferSelect)['kind'];
  tags: string | null;
  createdAt: string;
};

/**
 * The newest notes' text, for the journal writer to check itself against so
 * it does not write down what is already written.
 */
export function recentJourneyNoteTexts(limit: number): string[] {
  return db
    .select({ text: journeyNotes.text })
    .from(journeyNotes)
    .orderBy(desc(journeyNotes.createdAt))
    .limit(limit)
    .all()
    .map((row) => row.text);
}

/**
 * Prose for the model, with the date, since "when" is half of what a
 * reflection means.
 *
 * The date is the reader's local day. `createdAt` is UTC, and slicing it put
 * an evening note on the next day for anyone east of Greenwich's evening.
 * Whole notes only, for the same reason as `fitLines`.
 */
export function formatJourneyNotes(notes: JourneyNote[]): string {
  if (notes.length === 0) {
    return 'Nothing has been written down on their journey yet.';
  }
  const lines = notes.map(
    (note) => `${localDayString(new Date(note.createdAt))}: ${note.text}`,
  );
  return 'Reflections from their journey, newest first:\n' + fitLines(lines, MAX_NOTES_CHARS);
}

// ── Writes ───────────────────────────────────────────────────────────────────

function createId(): string {
  return `jn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * One note per thing that ended, so ending it again rewrites the note rather
 * than adding a second.
 *
 * Without this, a book toggled back to reading and finished again, or a goal
 * whose note is rewritten when Samwell's takeaway arrives, left two notes
 * saying the same thing, and both came back from a search as if the user had
 * done it twice.
 *
 * `restamp` moves the note to now. Right for a book finished again, which is
 * a new finish; wrong for a goal note being filled in afterwards, whose date
 * is the day the goal ended.
 */
function upsertEndingNote(
  kind: 'book_finished' | 'book_removed' | 'goal_finished',
  sourceRef: string,
  text: string,
  tags: string[],
  restamp: boolean,
): void {
  const tagsJson = tags.length > 0 ? JSON.stringify(tags) : null;
  const existing = db
    .select({ id: journeyNotes.id })
    .from(journeyNotes)
    .where(and(eq(journeyNotes.kind, kind), eq(journeyNotes.sourceRef, sourceRef)))
    .all();

  if (existing.length === 0) {
    db.insert(journeyNotes)
      .values({
        id: createId(),
        kind,
        text,
        tags: tagsJson,
        sourceRef,
        createdAt: new Date().toISOString(),
      })
      .run();
    return;
  }

  const [keep, ...extra] = existing;
  db.update(journeyNotes)
    .set({ text, tags: tagsJson, ...(restamp ? { createdAt: new Date().toISOString() } : {}) })
    .where(eq(journeyNotes.id, keep.id))
    .run();
  // Duplicates written before this existed collapse into the one kept.
  if (extra.length > 0) {
    db.delete(journeyNotes)
      .where(inArray(journeyNotes.id, extra.map((row) => row.id)))
      .run();
  }
}

export function saveJourneyReflection(text: string, sourceRef: string, tags: string[] = []): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  db.insert(journeyNotes)
    .values({
      id: createId(),
      kind: 'reflection',
      text: trimmed,
      tags: tags.length > 0 ? JSON.stringify(tags) : null,
      sourceRef,
      createdAt: new Date().toISOString(),
    })
    .run();
}

/**
 * Deterministic note written when a book is finished, its identity plus the
 * top tags the user attached while reading it. No LLM call.
 */
export function saveBookFinishedNote(bookId: string): void {
  const book = db
    .select({ title: books.title, author: books.author, category: books.category })
    .from(books)
    .where(eq(books.id, bookId))
    .get();
  if (!book) return;

  const tagRows = db
    .select({ tags: highlights.tags })
    .from(highlights)
    .where(eq(highlights.bookId, bookId))
    .all();
  const counts = new Map<string, number>();
  for (const row of tagRows) {
    for (const tag of parseTags(row.tags)) {
      const key = tag.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const topTags = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t);

  const text =
    `Finished "${book.title}" by ${book.author}${book.category ? ` (${book.category})` : ''}.` +
    (topTags.length > 0 ? ` Themes drawn from it: ${topTags.join(', ')}.` : '');

  upsertEndingNote('book_finished', bookId, text, topTags, true);
}

const STILL_GONE = 'They have since deleted it from their library.';

/**
 * What Samwell keeps when the reader deletes a book, read while the rows
 * still exist. `saveBookRemovedNote` writes it once the delete has gone
 * through, so a delete that fails never leaves him believing a book is gone.
 */
export type BookRemoval = {
  bookId: string;
  text: string;
  finishedNote: { id: string; text: string } | null;
};

/**
 * Samwell keeps what he knew about a deleted book, since having read it is
 * still part of who they are, but he has to know it is gone: otherwise a note
 * about it reads as a book they still have, and he suggests going back to a
 * passage that no longer exists.
 *
 * Two writes. A note of its own, dated the day it was deleted, saying how far
 * they got. And the book's "Finished" note, if it has one, is marked too,
 * because that is the note a search for the title is most likely to return.
 *
 * Only for a delete the reader chose. The sync's stale cleanup also deletes
 * rows, but for a file that was moved or renamed, which comes straight back
 * under a new id; recording that as "deleted" would be wrong.
 */
export function describeBookRemoval(bookId: string): BookRemoval | null {
  const book = db
    .select({ title: books.title, author: books.author, status: books.status })
    .from(books)
    .where(eq(books.id, bookId))
    .get();
  if (!book) return null;

  const progress = db
    .select({ percentage: readingProgress.percentage })
    .from(readingProgress)
    .where(eq(readingProgress.bookId, bookId))
    .get();
  const finishedNote =
    db
      .select({ id: journeyNotes.id, text: journeyNotes.text })
      .from(journeyNotes)
      .where(and(eq(journeyNotes.kind, 'book_finished'), eq(journeyNotes.sourceRef, bookId)))
      .get() ?? null;

  const pct = progress ? Math.round(progress.percentage * 100) : 0;
  const how =
    book.status === 'archived' || finishedNote
      ? ' after finishing it'
      : pct > 0
        ? ` without finishing it, ${pct}% of the way through`
        : ' without starting it';
  return {
    bookId,
    text: `Deleted "${book.title}" by ${book.author} from their library${how}. It is no longer there to open.`,
    finishedNote,
  };
}

export function saveBookRemovedNote(removal: BookRemoval): void {
  upsertEndingNote('book_removed', removal.bookId, removal.text, [], true);
  const { finishedNote } = removal;
  if (finishedNote && !finishedNote.text.includes(STILL_GONE)) {
    db.update(journeyNotes)
      .set({ text: `${finishedNote.text} ${STILL_GONE}` })
      .where(eq(journeyNotes.id, finishedNote.id))
      .run();
  }
}

/** What a goal banked against its number: `12 of 20 sessions`. */
export function formatOutcomeSummary(
  value: number | null,
  target: number | null,
  unit: string | null,
): string | null {
  if (value == null || target == null) return null;
  return `${value} of ${target} ${unit ?? ''}`.trim();
}

/**
 * A permanent one-line record of how a goal ended, so the next goal-setup
 * conversation sizes against real history instead of starting from zero.
 *
 * Written twice: once at the archive, with no takeaway, and again when
 * Samwell's takeaway lands, which rewrites the same note in place.
 *
 * No rank and no grade. The old model handed out an A/B/C letter for finishing
 * early, on time or late, which is a badge, and a badge is exactly what this
 * rebuild set out not to have. What is worth remembering in two years is what
 * the goal was, whether it was finished, and how reliably it was worked at —
 * so that is what gets written.
 */
export function saveGoalFinishedNote(
  goalId: string,
  title: string,
  outcome: {
    completed: boolean;
    /** 0..1, or null when nothing was ever expected of it. */
    executionRatio: number | null;
    /** What the goal banked against its number, when it carried one. */
    outcomeSummary?: string | null;
    /**
     * Why it was abandoned, in the reader's own words.
     *
     * The most valuable sentence in the whole note and the only part no
     * amount of data could reconstruct. A goal that was dropped because the
     * plan was wrong and one dropped because the reader stopped caring look
     * identical in the numbers, and they should lead to completely different
     * conversations the next time something like it is proposed.
     */
    reason?: string | null;
    /** Samwell's reading of how it went, when he has written one. */
    takeaway?: string | null;
  },
): void {
  const consistency =
    outcome.executionRatio == null
      ? ''
      : ` Consistency across its life: ${Math.round(outcome.executionRatio * 100)}%.`;
  const banked = outcome.outcomeSummary ? ` Reached ${outcome.outcomeSummary}.` : '';
  const why = outcome.reason?.trim() ? ` They said: "${outcome.reason.trim()}"` : '';
  const read = outcome.takeaway?.trim() ? ` ${outcome.takeaway.trim()}` : '';

  const text =
    (outcome.completed
      ? `Completed goal "${title}".${consistency}${banked}`
      : `Stopped goal "${title}" before the end.${consistency}${banked}${why}`) + read;

  upsertEndingNote('goal_finished', goalId, text, [], false);
}
