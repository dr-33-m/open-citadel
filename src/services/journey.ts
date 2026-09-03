import { and, desc, eq, gte } from 'drizzle-orm';

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
const MAX_NOTES_CHARS = 1000;
const RECENT_FINISHED = 6;
/** How far back the snapshot looks to say whether the work is happening. */
const RECENT_LOG_DAYS = 14;
const TOP_TAGS = 8;
/** How many notes are considered, and how many come back. */
const JOURNEY_NOTE_POOL = 80;
const JOURNEY_NOTE_RESULTS = 5;

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
  const rows = db.select({ tags: highlights.tags }).from(highlights).all();
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
    const goal = db.select().from(goals).where(eq(goals.status, 'ACTIVE')).get();
    if (goal) {
      lines.push(`Active goal: ${goal.title} (through ${goal.endDate})`);

      const active = db
        .select({ id: trackables.id, title: trackables.title })
        .from(trackables)
        .where(and(eq(trackables.goalId, goal.id), eq(trackables.status, 'ACTIVE')))
        .all();
      if (active.length > 0) {
        lines.push('Tracking: ' + active.map((t) => t.title).join('; '));
      }

      // Deliberately a count of recent logs rather than a score. There is no
      // focus score in this model, and no streak either — the snapshot's job is
      // to say whether the work is happening lately, not to grade it.
      const since = addDaysYmd(localDayString(), -RECENT_LOG_DAYS);
      const recent = db
        .select({ id: trackableLogs.id, completed: trackableLogs.completed })
        .from(trackableLogs)
        .innerJoin(trackables, eq(trackableLogs.trackableId, trackables.id))
        .where(and(eq(trackables.goalId, goal.id), gte(trackableLogs.date, since)))
        .all();
      if (recent.length > 0) {
        const done = recent.filter((r) => r.completed !== 0).length;
        const missed = recent.length - done;
        lines.push(
          `Last ${RECENT_LOG_DAYS} days: ${done} logged done` +
            (missed > 0 ? `, ${missed} logged as missed` : ''),
        );
      }
    }
  }

  return lines.join('\n').slice(0, MAX_SNAPSHOT_CHARS);
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

  if (notes.length === 0) return [];

  const keywords = extractKeywords(query);
  if (keywords.length === 0) return notes.slice(0, limit);

  const scored = notes
    .map((note) => {
      const hay = `${note.text} ${parseTags(note.tags).join(' ')}`.toLowerCase();
      return { note, score: keywords.reduce((sum, k) => sum + (hay.includes(k) ? 1 : 0), 0) };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.note);

  return scored.length > 0 ? scored : notes.slice(0, limit);
}

export type JourneyNote = {
  text: string;
  kind: 'reflection' | 'book_finished' | 'goal_finished';
  tags: string | null;
  createdAt: string;
};

/** Prose for the model, with the date, since "when" is half of what a
 *  reflection means. */
export function formatJourneyNotes(notes: JourneyNote[]): string {
  if (notes.length === 0) {
    return 'Nothing has been written down on their journey yet that matches this.';
  }
  return (
    'Reflections from their journey, newest first:\n' +
    notes
      .map((note) => `${note.createdAt.slice(0, 10)} — ${note.text}`)
      .join('\n')
      .slice(0, MAX_NOTES_CHARS)
  );
}

// ── Writes ───────────────────────────────────────────────────────────────────

function createId(): string {
  return `jn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
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

  db.insert(journeyNotes)
    .values({
      id: createId(),
      kind: 'book_finished',
      text,
      tags: topTags.length > 0 ? JSON.stringify(topTags) : null,
      sourceRef: bookId,
      createdAt: new Date().toISOString(),
    })
    .run();
}

/**
 * Deterministic note written when a goal is archived: either how the finish
 * compared to the original target (completed) or that it was retired before
 * reaching its planned scope (abandoned) — so the next goal-setup
 * conversation sizes against real history instead of starting from zero. No
 * LLM call.
 */
/**
 * A permanent one-line record of how a goal ended.
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
  },
): void {
  const consistency =
    outcome.executionRatio == null
      ? ''
      : ` Consistency across its life: ${Math.round(outcome.executionRatio * 100)}%.`;

  const text = outcome.completed
    ? `Completed goal "${title}".${consistency}`
    : `Stopped goal "${title}" before the end.${consistency}`;

  db.insert(journeyNotes)
    .values({
      id: createId(),
      kind: 'goal_finished',
      text,
      tags: null,
      sourceRef: goalId,
      createdAt: new Date().toISOString(),
    })
    .run();
}
